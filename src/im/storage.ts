/** A single IM message event recorded by the server. */
export interface IMEvent {
  id: string;
  platform: string;
  userId: string;
  chatId: string;
  text: string;
  replyText: string | undefined;
  timestamp: string; // ISO 8601
}

/**
 * In-memory ring buffer for recent IM message events.
 * Stores up to `capacity` events; oldest entries are dropped when full.
 */
export class IMEventStorage {
  readonly #capacity: number;
  readonly #events: IMEvent[] = [];
  #counter = 0;

  constructor(capacity = 200) {
    this.#capacity = capacity;
  }

  /** Append a new event. Returns the assigned event id. */
  append(event: Omit<IMEvent, "id" | "timestamp">): string {
    const id = String(++this.#counter);
    const entry: IMEvent = { id, timestamp: new Date().toISOString(), ...event };
    if (this.#events.length >= this.#capacity) {
      this.#events.shift();
    }
    this.#events.push(entry);
    return id;
  }

  /** Update the replyText of an existing event by id. */
  setReply(id: string, replyText: string): void {
    const event = this.#events.find((e) => e.id === id);
    if (event) event.replyText = replyText;
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
}
