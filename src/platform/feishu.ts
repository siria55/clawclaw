import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IMPlatform, IMMessage, IMVerifyParams } from "./types.js";

interface FeishuConfig {
  appId: string;
  appSecret: string;
  /** Verification token from Feishu open platform console */
  verificationToken: string;
  /**
   * Encrypt key for AES body decryption and signature verification (optional).
   * When set, all request bodies are AES-256-CBC encrypted by Feishu.
   */
  encryptKey: string | undefined;
}

/** Max age of a Feishu request timestamp before it's considered a replay attack. */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/**
 * Feishu (Lark) IM platform adapter.
 *
 * Required env vars: FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_VERIFICATION_TOKEN
 * Optional env var:  FEISHU_ENCRYPT_KEY (enables AES body decryption + signature verification)
 */
export class FeishuPlatform implements IMPlatform {
  readonly name = "feishu";
  readonly #config: FeishuConfig;

  constructor(config?: Partial<FeishuConfig>) {
    this.#config = {
      appId: config?.appId ?? requireEnv("FEISHU_APP_ID"),
      appSecret: config?.appSecret ?? requireEnv("FEISHU_APP_SECRET"),
      verificationToken: config?.verificationToken ?? requireEnv("FEISHU_VERIFICATION_TOKEN"),
      encryptKey: config?.encryptKey ?? process.env["FEISHU_ENCRYPT_KEY"],
    };
  }

  async verify(params: IMVerifyParams): Promise<void> {
    const { headers, body } = params;

    // Decrypt body first if encryptKey is configured — Feishu encrypts ALL events including
    // the initial url_verification challenge.
    const plainBody = this.#decrypt(body);

    // Handle url_verification before any signature check.
    // Feishu sends the challenge without x-lark-signature headers.
    try {
      const event = JSON.parse(plainBody) as Record<string, unknown>;
      if (event["type"] === "url_verification") {
        throw new FeishuChallenge(event["challenge"] as string);
      }
    } catch (err) {
      if (err instanceof FeishuChallenge) throw err;
      // Not JSON — fall through to signature check
    }

    // Reject stale requests (replay protection)
    const timestamp = headers["x-lark-request-timestamp"];
    if (timestamp) {
      const age = Date.now() - Number(timestamp) * 1000;
      if (Math.abs(age) > MAX_TIMESTAMP_AGE_MS) {
        throw new Error("Feishu request timestamp too old");
      }
    }

    // Signature verification when encryptKey is configured
    const signature = headers["x-lark-signature"];
    if (this.#config.encryptKey) {
      if (!signature || !timestamp) {
        throw new Error("Feishu signature headers missing");
      }
      const nonce = headers["x-lark-request-nonce"] ?? "";
      const expected = computeFeishuSignature(timestamp, nonce, this.#config.encryptKey, body);
      if (signature !== expected) {
        throw new Error("Feishu signature mismatch");
      }
    }
  }

  async parse(body: string): Promise<IMMessage | null> {
    const plainBody = this.#decrypt(body);
    const event = JSON.parse(plainBody) as Record<string, unknown>;

    // Feishu URL verification challenge on first setup
    if (event["type"] === "url_verification") {
      throw new FeishuChallenge(event["challenge"] as string);
    }

    const header = event["header"] as Record<string, unknown> | undefined;
    const eventBody = event["event"] as Record<string, unknown> | undefined;

    if (header?.["event_type"] !== "im.message.receive_v1") return null;

    const message = eventBody?.["message"] as Record<string, unknown> | undefined;
    const sender = eventBody?.["sender"] as Record<string, unknown> | undefined;

    if (!message || !sender) return null;

    // Skip messages sent by the bot itself
    if ((sender["sender_type"] as string) === "app") return null;

    const content = JSON.parse(message["content"] as string) as { text?: string };
    const senderId = asRecord(sender["sender_id"]);
    const chatId = asString(message["chat_id"]);
    const userId = asString(senderId?.["open_id"]);

    return {
      platform: this.name,
      chatId,
      sessionId: buildFeishuSessionId(message, chatId),
      continuityId: buildContinuityId(this.name, chatId, userId),
      userId,
      text: content.text?.trim() ?? "",
      raw: event,
    };
  }

  /**
   * Upload an image (URL or local file path) and send it as a Feishu image message.
   */
  async sendImage(chatId: string, source: string): Promise<void> {
    const token = await this.#getAccessToken();
    const imageKey = await this.#uploadImage(token, source);
    const receiveIdType = chatId.startsWith("ou_") ? "open_id" : "chat_id";
    const response = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ receive_id: chatId, msg_type: "image", content: JSON.stringify({ image_key: imageKey }) }),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu sendImage failed: ${response.status} ${body}`);
    }
  }

  /**
   * Upload a raw image buffer and send it as a Feishu image message.
   */
  async sendImageBuffer(chatId: string, buffer: Buffer): Promise<void> {
    const token = await this.#getAccessToken();
    const imageKey = await this.#uploadImageBuffer(token, buffer);
    const receiveIdType = chatId.startsWith("ou_") ? "open_id" : "chat_id";
    const response = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ receive_id: chatId, msg_type: "image", content: JSON.stringify({ image_key: imageKey }) }),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu sendImageBuffer failed: ${response.status} ${body}`);
    }
  }

  async #uploadImageBuffer(token: string, buffer: Buffer): Promise<string> {
    const form = new FormData();
    form.append("image_type", "message");
    form.append("image", new Blob([buffer]), "image.png");

    const response = await fetch("https://open.feishu.cn/open-apis/im/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu uploadImage failed: ${response.status} ${body}`);
    }
    const data = await response.json() as { code: number; data?: { image_key: string } };
    if (data.code !== 0 || !data.data?.image_key) {
      throw new Error(`Feishu uploadImage error: ${JSON.stringify(data)}`);
    }
    return data.data.image_key;
  }

  async #uploadImage(token: string, source: string): Promise<string> {
    const isUrl = source.startsWith("http://") || source.startsWith("https://");
    const imageBuffer = isUrl
      ? Buffer.from(await (await fetch(source)).arrayBuffer())
      : readFileSync(source);

    const form = new FormData();
    form.append("image_type", "message");
    form.append("image", new Blob([imageBuffer]), "image.png");

    const response = await fetch("https://open.feishu.cn/open-apis/im/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu uploadImage failed: ${response.status} ${body}`);
    }
    const data = await response.json() as { code: number; data?: { image_key: string } };
    if (data.code !== 0 || !data.data?.image_key) {
      throw new Error(`Feishu uploadImage error: ${JSON.stringify(data)}`);
    }
    return data.data.image_key;
  }

  async send(chatId: string, text: string): Promise<void> {
    const token = await this.#getAccessToken();
    const receiveIdType = chatId.startsWith("ou_") ? "open_id" : "chat_id";
    const response = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu send failed: ${response.status} ${body}`);
    }
  }

  /**
   * Decrypt body if it contains an `{"encrypt":"..."}` wrapper and encryptKey is set.
   * Returns the original body string unchanged otherwise.
   */
  #decrypt(body: string): string {
    if (!this.#config.encryptKey) return body;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (typeof parsed["encrypt"] !== "string") return body;
      return feishuAesDecrypt(parsed["encrypt"], this.#config.encryptKey);
    } catch {
      return body;
    }
  }

  async #getAccessToken(): Promise<string> {
    const response = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: this.#config.appId,
          app_secret: this.#config.appSecret,
        }),
      },
    );
    const data = (await response.json()) as { tenant_access_token: string };
    return data.tenant_access_token;
  }
}

/**
 * Decrypt a Feishu AES-256-CBC encrypted event body.
 * Key  = SHA256(encryptKey) — 32 bytes
 * Data = base64decode(encryptedStr): first 16 bytes = IV, rest = ciphertext
 */
export function feishuAesDecrypt(encryptedStr: string, encryptKey: string): string {
  const key = createHash("sha256").update(encryptKey).digest();
  const data = Buffer.from(encryptedStr, "base64");
  const iv = data.subarray(0, 16);
  const ciphertext = data.subarray(16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Compute Feishu request signature.
 * signature = SHA256(timestamp + nonce + encryptKey + body)
 */
export function computeFeishuSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  body: string,
): string {
  return createHash("sha256")
    .update(timestamp + nonce + encryptKey + body)
    .digest("hex");
}

/** Thrown when Feishu sends a URL verification challenge. Server must echo back `challenge`. */
export class FeishuChallenge extends Error {
  constructor(readonly challenge: string) {
    super("feishu_challenge");
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function buildFeishuSessionId(message: Record<string, unknown>, chatId: string): string {
  const anchorId = asString(message["root_id"]) || asString(message["thread_id"]) || asString(message["parent_id"]);
  return anchorId ? `${chatId}#thread:${anchorId}` : chatId;
}

function buildContinuityId(platform: string, chatId: string, userId: string): string {
  return `${platform}:${chatId}:${userId || "anonymous"}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
