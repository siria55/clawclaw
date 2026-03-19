import { afterEach, describe, expect, it, vi } from "vitest";
import { FeishuPlatform, FeishuChallenge, computeFeishuSignature } from "../../src/platform/feishu.js";

const BASE_CONFIG = {
  appId: "app_id",
  appSecret: "app_secret",
  verificationToken: "test_token",
};

/** Fresh timestamp string (seconds) that passes the 5-min age check. */
function nowTs(): string {
  return String(Math.floor(Date.now() / 1000));
}

function makeMessageEvent(extraMessage: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: "2.0",
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_user123" }, sender_type: "user" },
      message: {
        chat_id: "oc_chat456",
        chat_name: "产品讨论群",
        content: JSON.stringify({ text: "hello" }),
        ...extraMessage,
      },
    },
  });
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("FeishuPlatform.verify()", () => {
  it("passes when no encryptKey configured (token-only mode)", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    await expect(
      platform.verify({ method: "POST", headers: {}, query: {}, body: "{}" }),
    ).resolves.toBeUndefined();
  });

  it("passes with valid HMAC-SHA256 signature", async () => {
    const encryptKey = "my_encrypt_key";
    const timestamp = nowTs();
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
          "x-lark-request-timestamp": nowTs(),
          "x-lark-request-nonce": "nonce",
        },
        query: {},
        body: "{}",
      }),
    ).rejects.toThrow("signature mismatch");
  });

  it("rejects stale timestamp", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 400);
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
      chatName: "产品讨论群",
      sessionId: "oc_chat456",
      continuityId: "feishu:oc_chat456:ou_user123",
      userId: "ou_user123",
      text: "hello",
      eventType: "message",
    });
  });

  it("uses thread root as the session id when the message belongs to a thread", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    const msg = await platform.parse(makeMessageEvent({ root_id: "om_root789", thread_id: "omt_thread456" }));
    expect(msg).toMatchObject({
      chatId: "oc_chat456",
      sessionId: "oc_chat456#thread:om_root789",
      continuityId: "feishu:oc_chat456:ou_user123",
    });
  });

  it("throws FeishuChallenge for url_verification", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    await expect(
      platform.parse(JSON.stringify({ type: "url_verification", challenge: "xyz" })),
    ).rejects.toThrow(FeishuChallenge);
  });

  it("FeishuChallenge carries the challenge value", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    let caught: FeishuChallenge | undefined;
    try {
      await platform.parse(JSON.stringify({ type: "url_verification", challenge: "abc123" }));
    } catch (e) {
      if (e instanceof FeishuChallenge) caught = e;
    }
    expect(caught?.challenge).toBe("abc123");
  });

  it("returns null for bot's own message", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    const body = JSON.stringify({
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
    expect(
      await platform.parse(JSON.stringify({ header: { event_type: "other" }, event: {} })),
    ).toBeNull();
  });

  it("returns a system event when the bot is added to a group", async () => {
    const platform = new FeishuPlatform(BASE_CONFIG);
    const msg = await platform.parse(JSON.stringify({
      header: { event_type: "im.chat.member.bot.added_v1" },
      event: {
        chat_id: "oc_newgroup",
        name: "运营群",
        operator_id: { open_id: "ou_admin" },
      },
    }));

    expect(msg).toMatchObject({
      platform: "feishu",
      chatId: "oc_newgroup",
      chatName: "运营群",
      userId: "ou_admin",
      eventType: "bot_added",
      text: "机器人已加入群：运营群",
    });
  });
});

describe("computeFeishuSignature()", () => {
  it("is deterministic for the same inputs", () => {
    const s1 = computeFeishuSignature("ts", "nonce", "key", "body");
    const s2 = computeFeishuSignature("ts", "nonce", "key", "body");
    expect(s1).toBe(s2);
  });

  it("changes when any input changes", () => {
    const base = computeFeishuSignature("ts", "nonce", "key", "body");
    expect(computeFeishuSignature("ts2", "nonce", "key", "body")).not.toBe(base);
    expect(computeFeishuSignature("ts", "nonce", "key2", "body")).not.toBe(base);
  });
});

describe("FeishuPlatform org APIs", () => {
  it("fetches one department by open_department_id", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ tenant_access_token: "tenant-token" }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          department: {
            name: "研发部",
            open_department_id: "od_rnd",
            parent_department_id: "od_root",
            member_count: 12,
          },
        },
      }));
    global.fetch = fetchMock as typeof fetch;

    const platform = new FeishuPlatform(BASE_CONFIG);
    const department = await platform.getDepartment("od_rnd");

    expect(department).toMatchObject({
      name: "研发部",
      open_department_id: "od_rnd",
      member_count: 12,
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/contact/v3/departments/od_rnd");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("department_id_type=open_department_id");
  });

  it("lists users under one department", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ tenant_access_token: "tenant-token" }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          items: [
            { name: "张三", open_id: "ou_1", email: "zhangsan@example.com" },
            { name: "李四", open_id: "ou_2" },
          ],
          has_more: false,
        },
      }));
    global.fetch = fetchMock as typeof fetch;

    const platform = new FeishuPlatform(BASE_CONFIG);
    const page = await platform.listDepartmentUsers("od_rnd", { pageSize: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ name: "张三", open_id: "ou_1" });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/contact/v3/users/find_by_department");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("department_id=od_rnd");
  });

  it("finds departments by name across paginated results", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ tenant_access_token: "tenant-token" }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          items: [
            { name: "销售部", open_department_id: "od_sales" },
            { name: "研发平台部", open_department_id: "od_platform" },
          ],
          has_more: true,
          page_token: "next-page",
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ tenant_access_token: "tenant-token" }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          items: [
            { name: "研发部", open_department_id: "od_rnd" },
          ],
          has_more: false,
        },
      }));
    global.fetch = fetchMock as typeof fetch;

    const platform = new FeishuPlatform(BASE_CONFIG);
    const matches = await platform.findDepartmentsByName("研发部");

    expect(matches.map((item) => item.open_department_id)).toEqual(["od_rnd", "od_platform"]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("parent_department_id=0");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("fetch_child=true");
  });
});

describe("FeishuPlatform sending", () => {
  it("sends plain text as text message", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ tenant_access_token: "tenant-token" }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }));
    global.fetch = fetchMock as typeof fetch;

    const platform = new FeishuPlatform(BASE_CONFIG);
    await platform.send("oc_chat456", "hello world");

    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { msg_type: string; content: string };
    expect(payload.msg_type).toBe("text");
    expect(JSON.parse(payload.content)).toEqual({ text: "hello world" });
  });

  it("sends markdown content as post message", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ tenant_access_token: "tenant-token" }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }));
    global.fetch = fetchMock as typeof fetch;

    const platform = new FeishuPlatform(BASE_CONFIG);
    await platform.sendMarkdown("oc_chat456", "# 日报\n\n- 第一条\n- 第二条");

    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { msg_type: string; content: string };
    const content = JSON.parse(payload.content) as {
      zh_cn: { title?: string; content: Array<Array<{ tag: string; text: string }>> };
    };
    expect(payload.msg_type).toBe("post");
    expect(content.zh_cn.title).toBe("日报");
    expect(content.zh_cn.content[0]?.[0]).toEqual({ tag: "md", text: "- 第一条\n- 第二条" });
  });

  it("auto-switches to markdown post when text contains markdown structure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ tenant_access_token: "tenant-token" }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }));
    global.fetch = fetchMock as typeof fetch;

    const platform = new FeishuPlatform(BASE_CONFIG);
    await platform.send("oc_chat456", "## 更新\n\n1. 第一项\n2. 第二项");

    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { msg_type: string };
    expect(payload.msg_type).toBe("post");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
