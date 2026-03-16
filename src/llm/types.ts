import type { Tool } from "../tools/types.js";

export type MessageRole = "user" | "assistant" | "tool";

export interface Message {
  role: MessageRole;
  content: unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface LLMResponse {
  message: Message;
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMCompleteParams {
  system: string;
  messages: Message[];
  tools?: Tool[];
}

export interface LLMConfig {
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/** Minimal interface every LLM adapter must implement */
export interface LLMProvider {
  complete(params: LLMCompleteParams): Promise<LLMResponse>;
}
