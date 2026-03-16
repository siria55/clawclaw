import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  WecomPlatform,
  WecomEcho,
  verifyWecomSignature,
  wecomAesDecrypt,
  wecomAesEncrypt,
} from "../../src/platform/wecom.js";

// 43-char base64 key (WeCom requires exactly this length before padding)
const TEST_KEY = "abcdefghijklmnopqrstuvwxyz0123456789ABCDE";
const TEST_CORP_ID = "wx_corp_test";
const TEST_TOKEN = "mytoken";

const BASE_CONFIG = {
  corpId: TEST_CORP_ID,
  token: TEST_TOKEN,
  encodingAesKey: TEST_KEY,
  agentId: "1000001",
  corpSecret: "secret",
};

function sha1Sign(token: string, timestamp: string, nonce: string, encrypt: string): string {
  const sorted = [token, timestamp, nonce, encrypt].sort().join("");
  return createHash("sha1").update(sorted).digest("hex");
}

function makeXmlBody(content: string): string {
  return `<xml><Encrypt><![CDATA[${content}]]></Encrypt></xml>`;
}

function makeInnerXml(fromUser: string, text: string, toUser: string): string {
  return `<xml><ToUserName><![CDATA[${toUser}]]></ToUserName><FromUserName><![CDATA[${fromUser}]]></FromUserName><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${text}]]></Content></xml>`;
}

describe("wecomAesDecrypt / wecomAesEncrypt roundtrip", () => {
  it("decrypts what was encrypted", () => {
    const original = makeInnerXml("user1", "hello world", "bot1");
    const encrypted = wecomAesEncrypt(original, TEST_CORP_ID, TEST_KEY);
    const result = wecomAesDecrypt(encrypted, TEST_KEY);
    expect(result.message).toBe(original);
    expect(result.corpId).toBe(TEST_CORP_ID);
  });

  it("handles multi-byte UTF-8 content", () => {
    const original = makeInnerXml("u1", "你好世界 🎉", "bot");
    const encrypted = wecomAesEncrypt(original, TEST_CORP_ID, TEST_KEY);
    const { message } = wecomAesDecrypt(encrypted, TEST_KEY);
    expect(message).toBe(original);
  });
});

describe("verifyWecomSignature()", () => {
  it("passes for a correct signature", () => {
    const [timestamp, nonce, encrypt] = ["1700000000", "testnonce", "encrypted_str"];
    const sig = sha1Sign(TEST_TOKEN, timestamp, nonce, encrypt);
    expect(() => verifyWecomSignature(TEST_TOKEN, timestamp, nonce, encrypt, sig)).not.toThrow();
  });

  it("throws for a wrong signature", () => {
    expect(() =>
      verifyWecomSignature(TEST_TOKEN, "ts", "nonce", "encrypt", "bad_sig"),
    ).toThrow("signature mismatch");
  });
});

describe("WecomPlatform.verify()", () => {
  it("throws WecomEcho for GET URL verification", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const echoMsg = makeInnerXml("", "echo_content", "");
    const echoEncrypted = wecomAesEncrypt(echoMsg, TEST_CORP_ID, TEST_KEY);
    const timestamp = "1700000000";
    const nonce = "testnonce";
    const sig = sha1Sign(TEST_TOKEN, timestamp, nonce, echoEncrypted);

    await expect(
      platform.verify({
        method: "GET",
        headers: {},
        query: { msg_signature: sig, timestamp, nonce, echostr: echoEncrypted },
        body: "",
      }),
    ).rejects.toThrow(WecomEcho);
  });

  it("WecomEcho contains the decrypted echostr", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const echoMsg = makeInnerXml("", "my_echo", "");
    const echoEncrypted = wecomAesEncrypt(echoMsg, TEST_CORP_ID, TEST_KEY);
    const timestamp = "1700000000";
    const nonce = "testnonce";
    const sig = sha1Sign(TEST_TOKEN, timestamp, nonce, echoEncrypted);

    let echo: WecomEcho | undefined;
    try {
      await platform.verify({
        method: "GET",
        headers: {},
        query: { msg_signature: sig, timestamp, nonce, echostr: echoEncrypted },
        body: "",
      });
    } catch (err) {
      if (err instanceof WecomEcho) echo = err;
    }

    expect(echo?.echostr).toBe(echoMsg);
  });

  it("passes POST verify with valid signature", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const innerXml = makeInnerXml("user1", "hello", "bot");
    const encrypted = wecomAesEncrypt(innerXml, TEST_CORP_ID, TEST_KEY);
    const body = makeXmlBody(encrypted);
    const timestamp = "1700000000";
    const nonce = "testnonce";
    const sig = sha1Sign(TEST_TOKEN, timestamp, nonce, encrypted);

    await expect(
      platform.verify({
        method: "POST",
        headers: {},
        query: { msg_signature: sig, timestamp, nonce },
        body,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects POST with bad signature", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const body = makeXmlBody("some_encrypted");
    await expect(
      platform.verify({
        method: "POST",
        headers: {},
        query: { msg_signature: "bad", timestamp: "1700000000", nonce: "nonce" },
        body,
      }),
    ).rejects.toThrow("signature mismatch");
  });

  it("rejects when signature params are missing", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    await expect(
      platform.verify({ method: "POST", headers: {}, query: {}, body: "" }),
    ).rejects.toThrow("missing signature query params");
  });
});

describe("WecomPlatform.parse()", () => {
  it("returns IMMessage for a valid encrypted text message", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const innerXml = makeInnerXml("user_open_id", "  hi there  ", "bot_id");
    const encrypted = wecomAesEncrypt(innerXml, TEST_CORP_ID, TEST_KEY);
    const body = makeXmlBody(encrypted);

    const msg = await platform.parse(body);

    expect(msg).toMatchObject({
      platform: "wecom",
      userId: "user_open_id",
      text: "hi there",
    });
  });

  it("returns null when corp ID does not match", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const innerXml = makeInnerXml("user1", "hello", "bot");
    const encrypted = wecomAesEncrypt(innerXml, "wrong_corp", TEST_KEY);
    const body = makeXmlBody(encrypted);
    expect(await platform.parse(body)).toBeNull();
  });

  it("returns null for non-text message types", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const innerXml = `<xml><FromUserName><![CDATA[u1]]></FromUserName><MsgType><![CDATA[image]]></MsgType></xml>`;
    const encrypted = wecomAesEncrypt(innerXml, TEST_CORP_ID, TEST_KEY);
    const body = makeXmlBody(encrypted);
    expect(await platform.parse(body)).toBeNull();
  });

  it("returns null when Encrypt tag is missing", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    expect(await platform.parse("<xml><MsgType>text</MsgType></xml>")).toBeNull();
  });
});
