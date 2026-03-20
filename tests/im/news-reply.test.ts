import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IMEventStorage } from "../../src/im/storage.js";
import {
  createDailyDigestNewsReplyHandler,
  parseDailyDigestReplyIndex,
  parseNewsReplyIntent,
} from "../../src/im/news-reply.js";
import type { Agent } from "../../src/core/agent.js";
import type { FeishuPlatform } from "../../src/platform/feishu.js";
import type { Skill } from "../../src/skills/types.js";

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

function makeMockPlatform(): FeishuPlatform {
  return {
    send: vi.fn(async () => undefined),
    sendImage: vi.fn(async () => undefined),
    sendMarkdown: vi.fn(async () => undefined),
  } as unknown as FeishuPlatform;
}

function makeMockAgent(): Agent {
  return { name: "mock-agent" } as Agent;
}

describe("parseNewsReplyIntent", () => {
  it("matches default image requests", () => {
    expect(parseNewsReplyIntent("给我今天的新闻")).toEqual({ format: "image" });
  });

  it("matches explicit text requests", () => {
    expect(parseNewsReplyIntent("今天新闻文本版")).toEqual({ format: "text" });
  });
});

describe("parseDailyDigestReplyIndex", () => {
  it("parses plain numeric replies", () => {
    expect(parseDailyDigestReplyIndex("03")).toBe(3);
    expect(parseDailyDigestReplyIndex("8")).toBe(8);
    expect(parseDailyDigestReplyIndex("第3条")).toBeUndefined();
  });
});

describe("createDailyDigestNewsReplyHandler", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("sends today's digest image when it already exists", async () => {
    dir = mkdtempSync(join(tmpdir(), "claw-news-reply-"));
    const digestDir = join(dir, "daily-digest");
    mkdirSync(digestDir, { recursive: true });
    const pngPath = join(digestDir, `${todayKey()}.png`);
    writeFileSync(pngPath, Buffer.from("png"));
    writeFileSync(join(digestDir, `${todayKey()}.json`), JSON.stringify([createDigestArticle("A", "https://example.com/a")]));

    const platform = makeMockPlatform();
    const handler = createDailyDigestNewsReplyHandler({
      agent: makeMockAgent(),
      getPlatform: () => platform,
      getSkill: () => undefined,
      dataRoot: dir,
    });

    const result = await handler({
      platform: "feishu",
      chatId: "oc_daily",
      sessionId: "oc_daily",
      continuityId: "feishu:oc_daily:ou_user",
      userId: "ou_user",
      text: "给我今天的新闻",
      raw: {},
    });

    expect(result).toEqual(expect.objectContaining({ handled: true }));
    expect(vi.mocked(platform.sendImage)).toHaveBeenCalledWith("oc_daily", pngPath);
    expect(vi.mocked(platform.send)).toHaveBeenCalledWith("oc_daily", expect.stringContaining("回复 1-1"));
  });

  it("generates today's digest when missing before sending image", async () => {
    dir = mkdtempSync(join(tmpdir(), "claw-news-generate-"));
    const platform = makeMockPlatform();
    const skill: Skill = {
      id: "daily-digest",
      description: "digest",
      run: vi.fn(async ({ dataDir }) => {
        const targetDir = dataDir ?? join(dir!, "daily-digest");
        mkdirSync(targetDir, { recursive: true });
        writeFileSync(join(targetDir, `${todayKey()}.png`), Buffer.from("png"));
        writeFileSync(join(targetDir, `${todayKey()}.md`), "# 今日新闻\n\n- 第一条");
        writeFileSync(join(targetDir, `${todayKey()}.json`), JSON.stringify([createDigestArticle("A", "https://example.com/a")]));
        return { outputPath: join(targetDir, `${todayKey()}.png`) };
      }),
    };
    const handler = createDailyDigestNewsReplyHandler({
      agent: makeMockAgent(),
      getPlatform: () => platform,
      getSkill: () => skill,
      dataRoot: dir,
    });

    await handler({
      platform: "feishu",
      chatId: "oc_daily",
      sessionId: "oc_daily",
      continuityId: "feishu:oc_daily:ou_user",
      userId: "ou_user",
      text: "给我今天的新闻",
      raw: {},
    });

    expect(skill.run).toHaveBeenCalledOnce();
    expect(vi.mocked(platform.sendImage)).toHaveBeenCalledOnce();
    expect(vi.mocked(platform.send)).toHaveBeenCalledWith("oc_daily", expect.stringContaining("回复 1-1"));
  });

  it("sends markdown when the request explicitly asks for text", async () => {
    dir = mkdtempSync(join(tmpdir(), "claw-news-text-"));
    const digestDir = join(dir, "daily-digest");
    mkdirSync(digestDir, { recursive: true });
    writeFileSync(join(digestDir, `${todayKey()}.md`), "# 今日新闻\n\n- 第一条");
    writeFileSync(join(digestDir, `${todayKey()}.json`), JSON.stringify([createDigestArticle("A", "https://example.com/a")]));

    const platform = makeMockPlatform();
    const handler = createDailyDigestNewsReplyHandler({
      agent: makeMockAgent(),
      getPlatform: () => platform,
      getSkill: () => undefined,
      dataRoot: dir,
    });

    await handler({
      platform: "feishu",
      chatId: "oc_daily",
      sessionId: "oc_daily",
      continuityId: "feishu:oc_daily:ou_user",
      userId: "ou_user",
      text: "今天新闻文本版",
      raw: {},
    });

    expect(vi.mocked(platform.sendMarkdown)).toHaveBeenCalledWith("oc_daily", "# 今日新闻\n\n- 第一条");
    expect(vi.mocked(platform.send)).toHaveBeenCalledWith("oc_daily", expect.stringContaining("回复 1-1"));
  });

  it("sends the matching article link when the user replies with a digest number", async () => {
    dir = mkdtempSync(join(tmpdir(), "claw-news-link-"));
    const digestDir = join(dir, "daily-digest");
    mkdirSync(digestDir, { recursive: true });
    writeFileSync(join(digestDir, `${todayKey()}.json`), JSON.stringify([
      createDigestArticle("第一条", "https://example.com/a"),
      createDigestArticle("第二条", "https://example.com/b", "international"),
    ]));

    const imEventStorage = new IMEventStorage(20);
    const eventId = imEventStorage.append({
      platform: "feishu",
      userId: "ou_user",
      chatId: "oc_daily",
      text: "给我今天的新闻",
      replyText: undefined,
    });
    imEventStorage.setReply(eventId, `[日报图片] ${todayKey()}`);

    const platform = makeMockPlatform();
    const handler = createDailyDigestNewsReplyHandler({
      agent: makeMockAgent(),
      getPlatform: () => platform,
      getSkill: () => undefined,
      dataRoot: dir,
      imEventStorage,
    });

    const result = await handler({
      platform: "feishu",
      chatId: "oc_daily",
      sessionId: "oc_daily",
      continuityId: "feishu:oc_daily:ou_user",
      userId: "ou_user",
      text: "2",
      raw: {},
    });

    expect(result).toEqual({ handled: true, replyText: `[日报链接] ${todayKey()}#02` });
    expect(vi.mocked(platform.send)).toHaveBeenCalledWith("oc_daily", "https://example.com/b");
    expect(vi.mocked(platform.sendMarkdown)).not.toHaveBeenCalled();
  });

  it("does not hijack plain numeric messages when no recent digest was sent", async () => {
    dir = mkdtempSync(join(tmpdir(), "claw-news-no-context-"));
    const platform = makeMockPlatform();
    const handler = createDailyDigestNewsReplyHandler({
      agent: makeMockAgent(),
      getPlatform: () => platform,
      getSkill: () => undefined,
      dataRoot: dir,
      imEventStorage: new IMEventStorage(20),
    });

    const result = await handler({
      platform: "feishu",
      chatId: "oc_daily",
      sessionId: "oc_daily",
      continuityId: "feishu:oc_daily:ou_user",
      userId: "ou_user",
      text: "2",
      raw: {},
    });

    expect(result).toBeUndefined();
  });
});

function createDigestArticle(
  title: string,
  url: string,
  category: "domestic" | "international" = "domestic",
): { title: string; url: string; summary: string; source: string; category: "domestic" | "international" } {
  return {
    title,
    url,
    summary: `${title} 摘要`,
    source: "示例来源",
    category,
  };
}
