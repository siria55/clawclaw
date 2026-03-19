import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConversationStorage } from "../../src/im/conversations.js";

let dir = "";
let filePath = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "claw-conversations-"));
  filePath = join(dir, "conversations.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("ConversationStorage", () => {
  it("loads legacy chatId-keyed history files", () => {
    writeFileSync(filePath, JSON.stringify({
      chat1: [{ role: "user", content: "legacy hello" }],
    }), "utf8");

    const storage = new ConversationStorage(filePath);
    expect(storage.get("chat1")).toEqual([{ role: "user", content: "legacy hello" }]);
  });

  it("bridges a new session with the latest sibling session", () => {
    const storage = new ConversationStorage(filePath);
    storage.set(
      "chat1",
      [
        { role: "user", content: "先聊日报" },
        { role: "assistant", content: [{ type: "text", text: "好的，我去整理。" }] },
      ],
      "feishu:chat1:user1",
    );

    const history = storage.loadSession("chat1#thread:root1", "feishu:chat1:user1");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ role: "user" });
    expect(String(history[0]?.content)).toContain("上一条用户消息：先聊日报");
    expect(String(history[0]?.content)).toContain("你上一条回复：好的，我去整理。");
  });

  it("does not bridge across different continuity ids", () => {
    const storage = new ConversationStorage(filePath);
    storage.set("chat1", [{ role: "user", content: "hello" }], "feishu:chat1:user1");

    const history = storage.loadSession("chat1#thread:root1", "feishu:chat1:user2");
    expect(history).toEqual([]);
  });
});
