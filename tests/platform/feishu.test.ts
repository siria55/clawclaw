import { describe, it, expect } from "vitest";
import { FeishuPlatform, FeishuChallenge, computeFeishuSignature } from "../../src/platform/feishu.js";

const BASE_CONFIG = {
  appId: "app_id",
  appSecret: "app_secret",
  verificationToken: "test_token",
};

function makeMessageEvent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: "2.0",
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: {
        sender_id: { open_id: "ou_user123" },
        sender_type: "user",
      },
      message: {
        chat_id: "oc_chat456",
        content: JSON.stringify({ text: "hello" }),
        ...overrides,
      },
    },
  });
}

describe("FeishuPlatform.verify()", () => {
  it("passes when no encryptKey configured (token-only mode)", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    await expect(
      platform.verify({ method: "POST", headers: {}, query: {}, body: "{}" }),
    ).resolves.toBeUndefined();
  });

  it("passes with valid HMAC-SHA256 signature", async () => {
    const encryptKey = "my_encrypt_key";
    const timestamp = "1700000000";
    const nonce = "abc123";
    const body = '{"type":"event"}';
    const signature = computeFeishuSignature(timestamp, nonce, encryptKey, body);

    const platform = new FeishuPlatform({ ...BASE_CONFIG, encryptKey });
    await expect(
      platform.verify({
        method: "POST",
        headers: {
          "x-lark-signature": signature,
          "x-lark-request-timestamp": timestamp,
          "x-lark-request-nonce": nonce,
        },
        query: {},
        body,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects when signature is wrong", async () => {
    const platform = new FeishuPlatform({ ...BASE_CONFIG, encryptKey: "key" });
    await expect(
      platform.verify({
        method: "POST",
        headers: {
          "x-lark-signature": "bad_sig",
          "x-lark-request-timestamp": "1700000000",
          "x-lark-request-nonce": "nonce",
        },
        query: {},
        body: "{}",
      }),
    ).rejects.toThrow("signature mismatch");
  });

  it("rejects stale timestamp", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 400); // 6+ min ago
    await expect(
      platform.verify({
        method: "POST",
        headers: { "x-lark-request-timestamp": staleTimestamp },
        query: {},
        body: "{}",
      }),
    ).rejects.toThrow("timestamp too old");
  });
});

describe("FeishuPlatform.parse()", () => {
  it("returns IMMessage for a valid message event", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    const msg = await platform.parse(makeMessageEvent());

    expect(msg).toMatchObject({
      platform: "feishu",
      chatId: "oc_chat456",
      userId: "ou_user123",
      text: "hello",
    });
  });

  it("throws FeishuChallenge for url_verification", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    const body = JSON.stringify({ type: "url_verification", challenge: "xyz" });
    await expect(platform.parse(body)).rejects.toThrow(FeishuChallenge);
  });

  it("returns null for bot's own message", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    const body = JSON.stringify({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1" },
      event: {
        sender: { sender_type: "app", sender_id: { open_id: "bot" } },
        message: { chat_id: "oc_chat", content: '{"text":"hi"}' },
      },
    });
    expect(await platform.parse(body)).toBeNull();
  });

  it("returns null for unknown event types", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    const body = JSON.stringify({ header: { event_type: "some.other.event" }, event: {} });
    expect(await platform.parse(body)).toBeNull();
  });
});

describe("computeFeishuSignature()", () => {
  it("is deterministic for the same inputs", () => {
    const sig1 = computeFeishuSignature("ts", "nonce", "key", "body");
    const sig2 = computeFeishuSignature("ts", "nonce", "key", "body");
    expect(sig1).toBe(sig2);
  });

  it("changes when any input changes", () => {
    const base = computeFeishuSignature("ts", "nonce", "key", "body");
    expect(computeFeishuSignature("ts2", "nonce", "key", "body")).not.toBe(base);
    expect(computeFeishuSignature("ts", "nonce", "key2", "body")).not.toBe(base);
  });
});
