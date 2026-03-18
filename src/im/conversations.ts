import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Message } from "../llm/types.js";

const MAX_HISTORY = 40;

/**
 * Persists per-chatId conversation history to a JSON file.
 * Trims each conversation to the most recent MAX_HISTORY messages.
 */
export class ConversationStorage {
  readonly #filePath: string;
  readonly #data: Record<string, Message[]>;

  constructor(filePath: string) {
    this.#filePath = filePath;
    this.#data = existsSync(filePath) ? this.#load() : {};
  }

  /** Return stored message history for a chat. */
  get(chatId: string): Message[] {
    return this.#data[chatId] ?? [];
  }

  /** Replace history for a chat and persist. */
  set(chatId: string, messages: Message[]): void {
    this.#data[chatId] = messages.slice(-MAX_HISTORY);
    this.#persist();
  }

  #load(): Record<string, Message[]> {
    try {
      return JSON.parse(readFileSync(this.#filePath, "utf8")) as Record<string, Message[]>;
    } catch {
      return {};
    }
  }

  #persist(): void {
    try {
      writeFileSync(this.#filePath, JSON.stringify(this.#data), "utf8");
    } catch {
      // non-fatal
    }
  }
}
