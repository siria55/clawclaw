export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  streaming?: boolean;
}

export interface ToolEvent {
  id: string;
  type: "tool_call" | "tool_result" | "error";
  toolName?: string;
  data: unknown;
}

export type ChatItem = ChatMessage | ToolEventItem;

export interface ChatMessageItem {
  kind: "message";
  message: ChatMessage;
}

export interface ToolEventItem {
  kind: "event";
  event: ToolEvent;
}

export type ChatEntry = ChatMessageItem | ToolEventItem;

export interface ClawConfig {
  apiKey?: string;
  baseURL?: string;
  httpsProxy?: string;
  model?: string;
}
