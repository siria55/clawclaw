import type { Message, LLMProvider } from "../llm/types.js";

export interface ContextCompressorOptions {
  /**
   * Estimated token count that triggers compression.
   * Uses a rough 4-chars-per-token heuristic.
   * Default: 6000 tokens (~24000 chars)
   */
  threshold?: number;
  /**
   * Number of most-recent message pairs to keep verbatim after compression.
   * Default: 4
   */
  keepRecentPairs?: number;
}

/**
 * Interface for context compressor strategies.
 */
export interface ContextCompressor {
  /**
   * Compress the message history if it exceeds the configured threshold.
   * Returns the (possibly shortened) message array.
   */
  compress(messages: Message[]): Promise<Message[]>;
}

/**
 * Default LLM-based compressor.
 *
 * When total estimated tokens exceed `threshold`, it:
 * 1. Keeps the first user message (establishes intent)
 * 2. Summarises the middle portion via the LLM
 * 3. Keeps the last `keepRecentPairs` user+assistant pairs verbatim
 */
export class LLMContextCompressor implements ContextCompressor {
  readonly #llm: LLMProvider;
  readonly #threshold: number;
  readonly #keepRecentPairs: number;

  constructor(llm: LLMProvider, options: ContextCompressorOptions = {}) {
    this.#llm = llm;
    this.#threshold = options.threshold ?? 6000;
    this.#keepRecentPairs = options.keepRecentPairs ?? 4;
  }

  async compress(messages: Message[]): Promise<Message[]> {
    if (estimateTokens(messages) <= this.#threshold) return messages;

    // How many messages to keep at the tail (pairs = user + assistant)
    const keepCount = this.#keepRecentPairs * 2;

    // Always keep first message for intent, split rest into middle + tail
    const head = messages.slice(0, 1);
    const tail = messages.slice(-keepCount);
    const middle = messages.slice(1, -keepCount);

    if (middle.length === 0) return messages;

    const summary = await this.#summarise(middle);
    const summaryMessage: Message = {
      role: "user",
      content: `[Conversation summary — ${middle.length} messages compressed]\n${summary}`,
    };

    return [...head, summaryMessage, ...tail];
  }

  async #summarise(messages: Message[]): Promise<string> {
    const transcript = messages
      .map((m) => `${m.role.toUpperCase()}: ${extractText(m.content)}`)
      .join("\n");

    const response = await this.#llm.complete({
      system: "You are a concise assistant. Summarise the conversation below, preserving all key facts, decisions, and context needed to continue the conversation. Be brief.",
      messages: [{ role: "user", content: transcript }],
    });

    return extractText(response.message.content);
  }
}

/** Rough token estimate: 4 chars ≈ 1 token */
export function estimateTokens(messages: Message[]): number {
  return Math.ceil(
    messages.reduce((sum, m) => sum + extractText(m.content).length, 0) / 4,
  );
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: "text"; text: string } => (b as { type: string }).type === "text")
      .map((b) => b.text)
      .join("");
  }
  return "";
}
