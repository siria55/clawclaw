import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Message } from "../llm/types.js";

const MAX_HISTORY = 40;
const BRIDGE_TEXT_LIMIT = 160;

interface ConversationRecord {
  messages: Message[];
  continuityId: string;
  updatedAt: string;
}

interface ConversationFile {
  sessions: Record<string, ConversationRecord>;
}

/**
 * Persists per-session conversation history to a JSON file.
 * Trims each session to the most recent MAX_HISTORY messages.
 */
export class ConversationStorage {
  readonly #filePath: string;
  readonly #data: Record<string, ConversationRecord>;

  constructor(filePath: string) {
    this.#filePath = filePath;
    this.#data = existsSync(filePath) ? this.#load() : {};
  }

  /** Return stored message history for a session. */
  get(sessionId: string): Message[] {
    return this.#data[sessionId]?.messages ?? [];
  }

  /**
   * Return history for a session. When the session is new, inject a short
   * bridge note from the latest sibling session with the same continuityId.
   */
  loadSession(sessionId: string, continuityId: string): Message[] {
    const history = this.get(sessionId);
    if (history.length > 0) return history;
    const bridge = this.#buildBridge(sessionId, continuityId);
    return bridge ? [bridge] : [];
  }

  /** Replace history for a session and persist. */
  set(sessionId: string, messages: Message[], continuityId = ""): void {
    const previous = this.#data[sessionId];
    this.#data[sessionId] = {
      messages: messages.slice(-MAX_HISTORY),
      continuityId: continuityId || previous?.continuityId || "",
      updatedAt: new Date().toISOString(),
    };
    this.#persist();
  }

  /** Number of persisted sessions currently stored. */
  get sessionCount(): number {
    return Object.keys(this.#data).length;
  }

  /** Backing JSON file path on disk. */
  get filePath(): string {
    return this.#filePath;
  }

  #load(): Record<string, ConversationRecord> {
    try {
      const parsed = JSON.parse(readFileSync(this.#filePath, "utf8")) as unknown;
      return parseConversationData(parsed);
    } catch {
      return {};
    }
  }

  #buildBridge(sessionId: string, continuityId: string): Message | undefined {
    if (!continuityId) return undefined;
    const record = this.#findLatestSibling(sessionId, continuityId);
    const bridgeText = record ? formatBridgeText(record.messages) : "";
    return bridgeText ? { role: "user", content: bridgeText } : undefined;
  }

  #findLatestSibling(sessionId: string, continuityId: string): ConversationRecord | undefined {
    const entries = Object.entries(this.#data)
      .filter(([id, record]) => id !== sessionId && record.continuityId === continuityId)
      .map(([, record]) => record)
      .filter((record) => record.messages.length > 0);
    entries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return entries[0];
  }

  #persist(): void {
    const payload: ConversationFile = { sessions: this.#data };
    try {
      writeFileSync(this.#filePath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // non-fatal
    }
  }
}

function parseConversationData(value: unknown): Record<string, ConversationRecord> {
  const root = asRecord(value);
  if (!root) return {};
  const sessions = asRecord(root["sessions"]) ?? root;
  const parsed: Record<string, ConversationRecord> = {};
  for (const [sessionId, record] of Object.entries(sessions)) {
    const normalized = normalizeRecord(record);
    if (normalized) parsed[sessionId] = normalized;
  }
  return parsed;
}

function normalizeRecord(value: unknown): ConversationRecord | undefined {
  if (Array.isArray(value)) {
    return { messages: normalizeMessages(value), continuityId: "", updatedAt: "" };
  }
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    messages: normalizeMessages(record["messages"]),
    continuityId: asString(record["continuityId"]),
    updatedAt: asString(record["updatedAt"]),
  };
}

function normalizeMessages(value: unknown): Message[] {
  return Array.isArray(value) ? value.filter(isMessage) : [];
}

function isMessage(value: unknown): value is Message {
  const record = asRecord(value);
  if (!record) return false;
  const role = record["role"];
  return (role === "user" || role === "assistant" || role === "tool") && "content" in record;
}

function formatBridgeText(messages: Message[]): string {
  const lastUser = findLastText(messages, "user");
  const lastAssistant = findLastText(messages, "assistant");
  if (!lastUser && !lastAssistant) return "";
  const lines = [
    "[会话切换参考] 这是同一用户在当前飞书来源的上一段会话。若本轮延续上文，可自然接上；若已换题，请忽略。",
  ];
  if (lastUser) lines.push(`上一条用户消息：${limitText(lastUser)}`);
  if (lastAssistant) lines.push(`你上一条回复：${limitText(lastAssistant)}`);
  return lines.join("\n");
}

function findLastText(messages: Message[], role: "user" | "assistant"): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || message.role !== role) continue;
    const text = extractText(message.content);
    if (text) return text;
  }
  return "";
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => isTextBlock(block))
    .map((block) => block.text)
    .join("");
}

function isTextBlock(value: unknown): value is { type: "text"; text: string } {
  const record = asRecord(value);
  return record?.["type"] === "text" && typeof record["text"] === "string";
}

function limitText(text: string): string {
  return text.length > BRIDGE_TEXT_LIMIT ? `${text.slice(0, BRIDGE_TEXT_LIMIT)}...` : text;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
