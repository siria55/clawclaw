import { readFileSync, writeFileSync, existsSync } from "node:fs";

/** A single IM message event recorded by the server. */
export interface IMEvent {
  id: string;
  platform: string;
  userId: string;
  chatId: string;
  chatName?: string;
  eventType?: "message" | "bot_added" | "bot_removed" | "cron";
  text: string;
  replyText: string | undefined;
  timestamp: string; // ISO 8601
}

export interface IMChatRecord {
  platform: string;
  chatId: string;
  chatName?: string;
  active: boolean;
  joinedAt?: string;
  lastSeen: string;
  lastEventType: "message" | "bot_added" | "bot_removed" | "cron";
}

/**
 * Ring buffer for recent IM message events, optionally persisted to a JSON file.
 * Stores up to `capacity` events; oldest entries are dropped when full.
 */
export class IMEventStorage {
  readonly #capacity: number;
  readonly #events: IMEvent[] = [];
  readonly #chats = new Map<string, IMChatRecord>();
  readonly #filePath: string | undefined;
  #counter = 0;

  constructor(capacity = 200, filePath?: string) {
    this.#capacity = capacity;
    this.#filePath = filePath;
    if (filePath) this.#load(filePath);
  }

  /** Append a new event. Returns the assigned event id. */
  append(event: Omit<IMEvent, "id" | "timestamp">): string {
    const id = String(++this.#counter);
    const entry: IMEvent = { id, timestamp: new Date().toISOString(), ...event };
    if (this.#events.length >= this.#capacity) {
      this.#events.shift();
    }
    this.#events.push(entry);
    this.#updateChat(entry);
    this.#persist();
    return id;
  }

  /** Update the replyText of an existing event by id. */
  setReply(id: string, replyText: string): void {
    const event = this.#events.find((e) => e.id === id);
    if (event) {
      event.replyText = replyText;
      this.#persist();
    }
  }

  /** Return all events with id > sinceId (or all if sinceId is undefined). */
  since(sinceId: string | undefined): IMEvent[] {
    if (sinceId === undefined) return [...this.#events];
    const cutoff = Number(sinceId);
    return this.#events.filter((e) => Number(e.id) > cutoff);
  }

  /** Total number of events ever recorded (not capped). */
  get total(): number {
    return this.#counter;
  }

  /** Number of events currently retained in the ring buffer. */
  get count(): number {
    return this.#events.length;
  }

  /** Backing JSON file path on disk when persistence is enabled. */
  get filePath(): string | undefined {
    return this.#filePath;
  }

  /** Return tracked group chats, newest first. */
  listChats(platform?: string): IMChatRecord[] {
    return [...this.#chats.values()]
      .filter((chat) => chat.chatId.startsWith("oc_"))
      .filter((chat) => !platform || chat.platform === platform)
      .sort((left, right) => right.lastSeen.localeCompare(left.lastSeen));
  }

  #load(filePath: string): void {
    if (!existsSync(filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
        events: IMEvent[];
        counter: number;
        chats?: Record<string, IMChatRecord>;
      };
      const { events, counter } = parsed;
      this.#events.push(...events.slice(-this.#capacity));
      this.#counter = counter;
      for (const [key, value] of Object.entries(parsed.chats ?? {})) {
        this.#chats.set(key, value);
      }
    } catch {
      // corrupt file — start fresh
    }
  }

  #persist(): void {
    if (!this.#filePath) return;
    try {
      writeFileSync(this.#filePath, JSON.stringify({
        events: this.#events,
        counter: this.#counter,
        chats: Object.fromEntries(this.#chats.entries()),
      }, null, 2), "utf8");
    } catch {
      // non-fatal
    }
  }

  #updateChat(event: IMEvent): void {
    if (!event.chatId.startsWith("oc_")) return;

    const key = `${event.platform}:${event.chatId}`;
    const previous = this.#chats.get(key);
    const eventType = event.eventType ?? "message";
    const next: IMChatRecord = {
      platform: event.platform,
      chatId: event.chatId,
      active: eventType === "bot_removed" ? false : previous?.active ?? true,
      lastSeen: event.timestamp,
      lastEventType: eventType,
    };
    const chatName = event.chatName ?? previous?.chatName;
    if (chatName) next.chatName = chatName;
    if (eventType === "bot_added") next.joinedAt = event.timestamp;
    else if (previous?.joinedAt) next.joinedAt = previous.joinedAt;
    if (eventType === "bot_added") next.active = true;
    this.#chats.set(key, next);
  }
}
