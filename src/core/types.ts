import type { Message, LLMProvider } from "../llm/types.js";
import type { Tool, ToolResult } from "../tools/types.js";

export interface AgentConfig {
  /** Display name for this agent */
  name: string;
  /** System prompt */
  system: string;
  /** LLM provider instance */
  llm: LLMProvider;
  /** Available tools */
  tools?: Tool[];
}

export interface AgentOptions {
  /** Max conversation turns before stopping (default: 20) */
  maxTurns?: number;
}

export interface AgentRunResult {
  messages: Message[];
  turns: number;
}

export type AgentEvent =
  | { type: "message"; message: Message }
  | { type: "tool_call"; toolName: string; input: unknown }
  | { type: "tool_result"; toolName: string; result: ToolResult }
  | { type: "done"; result: AgentRunResult };
