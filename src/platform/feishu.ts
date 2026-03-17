import { createHmac } from "node:crypto";
import type { IMPlatform, IMMessage, IMVerifyParams } from "./types.js";

interface FeishuConfig {
  appId: string;
  appSecret: string;
  /** Verification token from Feishu open platform console */
  verificationToken: string;
  /**
   * Encrypt key for signature verification (optional).
   * When set, requests without a valid X-Lark-Signature are rejected.
   */
  encryptKey: string | undefined;
}

/** Max age of a Feishu request timestamp before it's considered a replay attack. */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/**
 * Feishu (Lark) IM platform adapter.
 *
 * Required env vars: FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_VERIFICATION_TOKEN
 * Optional env var:  FEISHU_ENCRYPT_KEY (enables request signature verification)
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

    // URL verification challenge from Feishu is sent without signature headers.
    // Handle it early so encryptKey does not block the initial endpoint setup.
    try {
      const event = JSON.parse(body) as Record<string, unknown>;
      if (event["type"] === "url_verification") {
        throw new FeishuChallenge(event["challenge"] as string);
      }
    } catch (err) {
      if (err instanceof FeishuChallenge) throw err;
      // Body is not JSON — continue to signature check
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
    const event = JSON.parse(body) as Record<string, unknown>;

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

    return {
      platform: this.name,
      chatId: message["chat_id"] as string,
      userId: (sender["sender_id"] as Record<string, string>)["open_id"] ?? "",
      text: content.text?.trim() ?? "",
      raw: event,
    };
  }

  async send(chatId: string, text: string): Promise<void> {
    const token = await this.#getAccessToken();
    const response = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
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
      throw new Error(`Feishu send failed: ${response.status}`);
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
 * Compute Feishu request signature.
 * signature = HMAC-SHA256(encryptKey, timestamp + nonce + body)
 */
export function computeFeishuSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  body: string,
): string {
  return createHmac("sha256", encryptKey)
    .update(timestamp + nonce + body)
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
