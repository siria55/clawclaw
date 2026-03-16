import type { IMPlatform, IMMessage } from "./types.js";

interface FeishuConfig {
  appId: string;
  appSecret: string;
  verificationToken: string;
}

/**
 * Feishu (Lark) IM platform adapter.
 *
 * Required env vars: FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_VERIFICATION_TOKEN
 */
export class FeishuPlatform implements IMPlatform {
  readonly name = "feishu";
  readonly #config: FeishuConfig;

  constructor(config?: Partial<FeishuConfig>) {
    this.#config = {
      appId: config?.appId ?? requireEnv("FEISHU_APP_ID"),
      appSecret: config?.appSecret ?? requireEnv("FEISHU_APP_SECRET"),
      verificationToken: config?.verificationToken ?? requireEnv("FEISHU_VERIFICATION_TOKEN"),
    };
  }

  async verify(headers: Record<string, string>, body: string): Promise<void> {
    // Feishu sends a challenge request on first setup — handled in parse().
    // Signature verification uses timestamp + token + body HMAC-SHA256.
    // TODO: implement full signature verification in Sprint 3.
    void headers;
    void body;
    void this.#config;
  }

  async parse(body: string): Promise<IMMessage | null> {
    const event = JSON.parse(body) as Record<string, unknown>;

    // Respond to Feishu URL verification challenge
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
    const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    });
    if (!response.ok) {
      throw new Error(`Feishu send failed: ${response.status}`);
    }
  }

  async #getAccessToken(): Promise<string> {
    const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: this.#config.appId,
        app_secret: this.#config.appSecret,
      }),
    });
    const data = (await response.json()) as { tenant_access_token: string };
    return data.tenant_access_token;
  }
}

/** Thrown when Feishu sends a URL verification challenge. */
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
