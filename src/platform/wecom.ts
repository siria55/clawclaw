import type { IMPlatform, IMMessage } from "./types.js";

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

  async verify(headers: Record<string, string>, body: string): Promise<void> {
    // WeCom uses msg_signature + timestamp + nonce for verification.
    // TODO: implement AES decrypt + signature verification in Sprint 3.
    void headers;
    void body;
    void this.#config;
  }

  async parse(body: string): Promise<IMMessage | null> {
    // WeCom sends XML; full AES decryption TODO in Sprint 3.
    // Skeleton: parse MsgType and extract basic fields.
    const fromUser = extractXmlTag(body, "FromUserName");
    const msgType = extractXmlTag(body, "MsgType");
    const content = extractXmlTag(body, "Content");
    const toUser = extractXmlTag(body, "ToUserName");

    if (!fromUser || msgType !== "text" || !content) return null;

    return {
      platform: this.name,
      chatId: toUser ?? fromUser,
      userId: fromUser,
      text: content.trim(),
      raw: body,
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

function extractXmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([^\\]]+)\\]\\]></${tag}>`));
  return match?.[1] ?? null;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
