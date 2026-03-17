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

export interface ThinkingItem {
  kind: "thinking";
  id: string;
  text: string;
  streaming?: boolean;
}

export type ChatEntry = ChatMessageItem | ToolEventItem | ThinkingItem;
