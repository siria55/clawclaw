import type { Message } from "../llm/types.js";
import type { IMMessage } from "../platform/types.js";
import type { ConversationStorage } from "./conversations.js";

export interface IMRunContext {
  history: Message[];
  input: string;
}

/** Build the prompt prefix and session history for an incoming IM message. */
export function buildIMRunContext(
  message: IMMessage,
  conversationStorage: ConversationStorage | undefined,
): IMRunContext {
  return {
    history: conversationStorage?.loadSession(message.sessionId, message.continuityId) ?? [],
    input: `${formatContextPrefix(message)}\n${message.text}`,
  };
}

/** Persist the latest agent history back into the current IM session. */
export function persistIMRunContext(
  conversationStorage: ConversationStorage | undefined,
  message: IMMessage,
  messages: Message[],
): void {
  conversationStorage?.set(message.sessionId, messages, message.continuityId);
}

function formatContextPrefix(message: IMMessage): string {
  const parts = [`消息来源: ${message.platform}`, `chatId: ${message.chatId}`];
  if (message.chatName) parts.push(`chatName: ${message.chatName}`);
  if (message.sessionId !== message.chatId) parts.push(`sessionId: ${message.sessionId}`);
  parts.push(`userId: ${message.userId}`);
  return `[${parts.join(" | ")}]`;
}
