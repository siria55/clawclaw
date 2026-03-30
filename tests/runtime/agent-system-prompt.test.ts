import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "../../src/runtime/agent-system-prompt.js";

describe("buildAgentSystemPrompt", () => {
  it("includes configured name and identity prompt for identity questions", () => {
    const prompt = buildAgentSystemPrompt({
      name: "慈航bot",
      systemPrompt: "我是 AI 时代的教育观察者。",
    }, {
      defaultName: "clawclaw",
      defaultSystem: "你是一个高效的 AI 助手。",
      currentDate: "2026/3/30",
    });

    expect(prompt).toContain("当前 Agent 名称：慈航bot。");
    expect(prompt).toContain("以下是必须优先遵守的身份设定与系统提示词：");
    expect(prompt).toContain("我是 AI 时代的教育观察者。");
    expect(prompt).toContain("基础能力要求：你是一个高效的 AI 助手。");
    expect(prompt).toContain("当用户询问“你是谁”");
    expect(prompt).toContain("当前日期：2026/3/30");
  });

  it("falls back to default name and default system when config is empty", () => {
    const prompt = buildAgentSystemPrompt(undefined, {
      defaultName: "clawclaw",
      defaultSystem: "你是一个高效的 AI 助手。",
    });

    expect(prompt).toContain("当前 Agent 名称：clawclaw。");
    expect(prompt).toContain("你是一个高效的 AI 助手。");
    expect(prompt).not.toContain("基础能力要求：");
  });
});
