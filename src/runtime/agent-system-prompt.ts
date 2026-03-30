import type { AgentMetaConfig } from "../config/types.js";

export interface BuildAgentSystemPromptOptions {
  defaultName: string;
  defaultSystem: string;
  currentDate?: string;
}

export function buildAgentSystemPrompt(
  config: AgentMetaConfig | undefined,
  options: BuildAgentSystemPromptOptions,
): string {
  const name = config?.name?.trim() || options.defaultName;
  const identity = config?.systemPrompt?.trim();
  const baseSystem = options.defaultSystem.trim();

  return [
    `当前 Agent 名称：${name}。`,
    identity
      ? `以下是必须优先遵守的身份设定与系统提示词：\n${identity}`
      : baseSystem,
    identity ? `基础能力要求：${baseSystem}` : "",
    "当用户询问“你是谁”“你叫什么”“你是做什么的”“你是哪个 bot”等身份问题时，必须优先依据上面的名称和身份设定，用第一人称直接回答，不要忽略。",
    "若上下文中提供了挂载文档资料，优先依据文档内容回答；文档未覆盖的细节要明确说明，不要编造。",
    "如需查询飞书部门、部门人数、直属成员等组织信息，优先调用飞书工具，不要凭空猜测。",
    options.currentDate ? `当前日期：${options.currentDate}` : "",
  ].filter(Boolean).join("\n");
}
