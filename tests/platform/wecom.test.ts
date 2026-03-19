import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  WecomPlatform,
  WecomEcho,
  verifyWecomSignature,
  wecomAesDecrypt,
  wecomAesEncrypt,
} from "../../src/platform/wecom.js";

/**
 * Valid 43-char base64 encodingAesKey.
 * Buffer.from(TEST_KEY + "=", "base64") decodes to exactly 32 bytes.
 * Derivation: base64(Buffer.alloc(32, 0x01)) = "AQEB...AQE=" → strip "=" → 43 chars.
 */
const TEST_KEY = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
const TEST_CORP_ID = "wx_corp_test";
const TEST_TOKEN = "mytoken";

const BASE_CONFIG = {
  corpId: TEST_CORP_ID,
  token: TEST_TOKEN,
  encodingAesKey: TEST_KEY,
  agentId: "1000001",
  corpSecret: "secret",
};

function sha1Sign(token: string, ts: string, nonce: string, encrypt: string): string {
  return createHash("sha1").update([token, ts, nonce, encrypt].sort().join("")).digest("hex");
}

function makeXmlBody(encrypted: string): string {
  return `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`;
}

function makeInnerXml(fromUser: string, text: string, toUser: string): string {
  return [
    "<xml>",
    `<ToUserName><![CDATA[${toUser}]]></ToUserName>`,
    `<FromUserName><![CDATA[${fromUser}]]></FromUserName>`,
    `<MsgType><![CDATA[text]]></MsgType>`,
    `<Content><![CDATA[${text}]]></Content>`,
    "</xml>",
  ].join("");
}

describe("wecomAesEncrypt / wecomAesDecrypt roundtrip", () => {
  it("decrypts what was encrypted", () => {
    const original = makeInnerXml("user1", "hello world", "bot1");
    const encrypted = wecomAesEncrypt(original, TEST_CORP_ID, TEST_KEY);
    const result = wecomAesDecrypt(encrypted, TEST_KEY);
    expect(result.message).toBe(original);
    expect(result.corpId).toBe(TEST_CORP_ID);
  });

  it("handles multi-byte UTF-8 content", () => {
    const original = makeInnerXml("u1", "你好世界 🎉", "bot");
    const { message } = wecomAesDecrypt(wecomAesEncrypt(original, TEST_CORP_ID, TEST_KEY), TEST_KEY);
    expect(message).toBe(original);
  });
});

describe("verifyWecomSignature()", () => {
  it("passes for a correct signature", () => {
    const [ts, nonce, enc] = ["1700000000", "testnonce", "some_encrypted_str"];
    const sig = sha1Sign(TEST_TOKEN, ts, nonce, enc);
    expect(() => verifyWecomSignature(TEST_TOKEN, ts, nonce, enc, sig)).not.toThrow();
  });

  it("throws for a wrong signature", () => {
    expect(() =>
      verifyWecomSignature(TEST_TOKEN, "ts", "nonce", "enc", "bad_sig"),
    ).toThrow("signature mismatch");
  });
});

describe("WecomPlatform.verify()", () => {
  it("throws WecomEcho for GET URL verification", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const echoMsg = makeInnerXml("", "echo_content", "");
    const echoEnc = wecomAesEncrypt(echoMsg, TEST_CORP_ID, TEST_KEY);
    const ts = "1700000000";
    const nonce = "testnonce";
    const sig = sha1Sign(TEST_TOKEN, ts, nonce, echoEnc);

    await expect(
      platform.verify({ method: "GET", headers: {}, query: { msg_signature: sig, timestamp: ts, nonce, echostr: echoEnc }, body: "" }),
    ).rejects.toThrow(WecomEcho);
  });

  it("WecomEcho carries the decrypted plaintext", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const echoMsg = makeInnerXml("", "my_echo_value", "");
    const echoEnc = wecomAesEncrypt(echoMsg, TEST_CORP_ID, TEST_KEY);
    const ts = "1700000000";
    const nonce = "n1";
    const sig = sha1Sign(TEST_TOKEN, ts, nonce, echoEnc);

    let echo: WecomEcho | undefined;
    try {
      await platform.verify({ method: "GET", headers: {}, query: { msg_signature: sig, timestamp: ts, nonce, echostr: echoEnc }, body: "" });
    } catch (e) {
      if (e instanceof WecomEcho) echo = e;
    }
    expect(echo?.echostr).toBe(echoMsg);
  });

  it("passes POST verify with valid signature", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const innerXml = makeInnerXml("user1", "hello", "bot");
    const encrypted = wecomAesEncrypt(innerXml, TEST_CORP_ID, TEST_KEY);
    const body = makeXmlBody(encrypted);
    const ts = "1700000000";
    const nonce = "testnonce";
    const sig = sha1Sign(TEST_TOKEN, ts, nonce, encrypted);

    await expect(
      platform.verify({ method: "POST", headers: {}, query: { msg_signature: sig, timestamp: ts, nonce }, body }),
    ).resolves.toBeUndefined();
  });

  it("rejects POST with bad signature", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    await expect(
      platform.verify({ method: "POST", headers: {}, query: { msg_signature: "bad", timestamp: "1700000000", nonce: "n" }, body: makeXmlBody("enc") }),
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
    const body = makeXmlBody(wecomAesEncrypt(innerXml, TEST_CORP_ID, TEST_KEY));

    const msg = await platform.parse(body);
    expect(msg).toMatchObject({
      platform: "wecom",
      chatId: "bot_id",
      sessionId: "bot_id",
      continuityId: "wecom:bot_id:user_open_id",
      userId: "user_open_id",
      text: "hi there",
    });
  });

  it("returns null when corp ID does not match", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const body = makeXmlBody(wecomAesEncrypt(makeInnerXml("u1", "hi", "bot"), "wrong_corp", TEST_KEY));
    expect(await platform.parse(body)).toBeNull();
  });

  it("returns null for non-text message types", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    const innerXml = `<xml><FromUserName><![CDATA[u1]]></FromUserName><MsgType><![CDATA[image]]></MsgType></xml>`;
    const body = makeXmlBody(wecomAesEncrypt(innerXml, TEST_CORP_ID, TEST_KEY));
    expect(await platform.parse(body)).toBeNull();
  });

  it("returns null when Encrypt tag is missing", async () => {
    const platform = new WecomPlatform(BASE_CONFIG);
    expect(await platform.parse("<xml><MsgType>text</MsgType></xml>")).toBeNull();
  });
});
