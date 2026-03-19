import { createDecipheriv, createCipheriv, createHash } from "node:crypto";
import type { IMPlatform, IMMessage, IMVerifyParams } from "./types.js";

interface WecomConfig {
  corpId: string;
  token: string;
  encodingAesKey: string;
  agentId: string;
  corpSecret: string;
}

/**
 * WeCom (企业微信) IM platform adapter.
 *
 * Required env vars:
 *   WECOM_CORP_ID, WECOM_CORP_SECRET, WECOM_AGENT_ID,
 *   WECOM_TOKEN, WECOM_ENCODING_AES_KEY
 */
export class WecomPlatform implements IMPlatform {
  readonly name = "wecom";
  readonly #config: WecomConfig;

  constructor(config?: Partial<WecomConfig>) {
    this.#config = {
      corpId: config?.corpId ?? requireEnv("WECOM_CORP_ID"),
      corpSecret: config?.corpSecret ?? requireEnv("WECOM_CORP_SECRET"),
      agentId: config?.agentId ?? requireEnv("WECOM_AGENT_ID"),
      token: config?.token ?? requireEnv("WECOM_TOKEN"),
      encodingAesKey: config?.encodingAesKey ?? requireEnv("WECOM_ENCODING_AES_KEY"),
    };
  }

  async verify(params: IMVerifyParams): Promise<void> {
    const { method, query } = params;

    const msgSignature = query["msg_signature"] ?? "";
    const timestamp = query["timestamp"] ?? "";
    const nonce = query["nonce"] ?? "";

    if (!msgSignature || !timestamp || !nonce) {
      throw new Error("WeCom: missing signature query params");
    }

    // GET = URL verification; decrypt echostr and return it
    if (method === "GET") {
      const echostr = query["echostr"] ?? "";
      if (!echostr) throw new Error("WeCom: missing echostr");
      verifyWecomSignature(this.#config.token, timestamp, nonce, echostr, msgSignature);
      const plain = wecomAesDecrypt(echostr, this.#config.encodingAesKey);
      throw new WecomEcho(plain.message);
    }

    // POST = incoming message; verify signature over the Encrypt tag
    const encryptTag = extractXmlTag(params.body, "Encrypt") ?? "";
    verifyWecomSignature(this.#config.token, timestamp, nonce, encryptTag, msgSignature);
  }

  async parse(body: string): Promise<IMMessage | null> {
    const encryptTag = extractXmlTag(body, "Encrypt");
    if (!encryptTag) return null;

    const plain = wecomAesDecrypt(encryptTag, this.#config.encodingAesKey);

    // Discard messages not for this corp
    if (plain.corpId !== this.#config.corpId) return null;

    const fromUser = extractXmlTag(plain.message, "FromUserName");
    const msgType = extractXmlTag(plain.message, "MsgType");
    const content = extractXmlTag(plain.message, "Content");
    const toUser = extractXmlTag(plain.message, "ToUserName");

    if (!fromUser || msgType !== "text" || !content) return null;
    const chatId = toUser ?? fromUser;

    return {
      platform: this.name,
      chatId,
      sessionId: chatId,
      continuityId: buildContinuityId(this.name, chatId, fromUser),
      userId: fromUser,
      text: content.trim(),
      raw: plain.message,
    };
  }

  async send(userId: string, text: string): Promise<void> {
    const token = await this.#getAccessToken();
    const response = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          touser: userId,
          msgtype: "text",
          agentid: Number(this.#config.agentId),
          text: { content: text },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`WeCom send failed: ${response.status}`);
    }
  }

  async #getAccessToken(): Promise<string> {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.#config.corpId}&corpsecret=${this.#config.corpSecret}`;
    const response = await fetch(url);
    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }
}

// ---------------------------------------------------------------------------
// Crypto helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Verify WeCom request signature.
 * signature = SHA1(sorted([token, timestamp, nonce, encryptedMsg]).join(""))
 */
export function verifyWecomSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encryptedMsg: string,
  expected: string,
): void {
  const sorted = [token, timestamp, nonce, encryptedMsg].sort().join("");
  const actual = createHash("sha1").update(sorted).digest("hex");
  if (actual !== expected) {
    throw new Error("WeCom signature mismatch");
  }
}

interface WecomDecryptResult {
  message: string;
  corpId: string;
}

/**
 * Decrypt a WeCom AES-256-CBC encrypted message.
 *
 * Plaintext format (after PKCS7 unpad):
 *   16 random bytes | 4 bytes msg length (big-endian) | msg bytes | corpId bytes
 */
export function wecomAesDecrypt(encrypted: string, encodingAesKey: string): WecomDecryptResult {
  const key = Buffer.from(encodingAesKey + "=", "base64"); // 32 bytes
  const iv = key.subarray(0, 16);
  const ciphertext = Buffer.from(encrypted, "base64");

  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const padLen = decrypted[decrypted.length - 1] ?? 0;
  const content = decrypted.subarray(0, decrypted.length - padLen);

  const msgLen = content.readUInt32BE(16);
  const message = content.subarray(20, 20 + msgLen).toString("utf8");
  const corpId = content.subarray(20 + msgLen).toString("utf8");

  return { message, corpId };
}

/**
 * Encrypt a message using WeCom AES-256-CBC.
 * Used for generating test vectors.
 */
export function wecomAesEncrypt(message: string, corpId: string, encodingAesKey: string): string {
  const key = Buffer.from(encodingAesKey + "=", "base64");
  const iv = key.subarray(0, 16);

  const random = Buffer.alloc(16, 0x42); // deterministic for tests
  const msgBuf = Buffer.from(message, "utf8");
  const corpBuf = Buffer.from(corpId, "utf8");
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(msgBuf.length);

  const plain = Buffer.concat([random, lenBuf, msgBuf, corpBuf]);

  const blockSize = 32;
  const padLen = blockSize - (plain.length % blockSize);
  const padded = Buffer.concat([plain, Buffer.alloc(padLen, padLen)]);

  const cipher = createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function extractXmlTag(xml: string, tag: string): string | null {
  const cdataMatch = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (cdataMatch) return cdataMatch[1] ?? null;
  const plainMatch = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return plainMatch?.[1] ?? null;
}

// ---------------------------------------------------------------------------

/** Thrown during GET URL verification. Server must respond with the plain echostr. */
export class WecomEcho extends Error {
  constructor(readonly echostr: string) {
    super("wecom_echo");
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function buildContinuityId(platform: string, chatId: string, userId: string): string {
  return `${platform}:${chatId}:${userId || "anonymous"}`;
}
