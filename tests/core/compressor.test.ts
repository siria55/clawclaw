import { describe, it, expect, vi } from "vitest";
import { LLMContextCompressor, estimateTokens } from "../../src/core/compressor.js";
import type { LLMProvider, LLMResponse, Message } from "../../src/llm/types.js";

function makeMockLLM(summaryText: string): LLMProvider {
  return {
    complete: vi.fn(async (): Promise<LLMResponse> => ({
      message: { role: "assistant", content: [{ type: "text", text: summaryText }] },
    })),
  };
}

function makeMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) =>
    i % 2 === 0
      ? { role: "user" as const, content: `user message ${i}` }
      : { role: "assistant" as const, content: `assistant reply ${i}` },
  );
}

describe("estimateTokens", () => {
  it("returns 0 for empty messages", () => {
    expect(estimateTokens([])).toBe(0);
  });

  it("estimates tokens as ceil(chars / 4)", () => {
    const messages: Message[] = [{ role: "user", content: "1234" }]; // 4 chars = 1 token
    expect(estimateTokens(messages)).toBe(1);
  });

  it("sums text across multiple messages", () => {
    const messages: Message[] = [
      { role: "user", content: "abcd" },
      { role: "assistant", content: "efgh" },
    ];
    expect(estimateTokens(messages)).toBe(2); // 8 chars / 4 = 2
  });

  it("handles array content blocks", () => {
    const messages: Message[] = [
      { role: "assistant", content: [{ type: "text", text: "abcdefgh" }] },
    ];
    expect(estimateTokens(messages)).toBe(2);
  });
});

describe("LLMContextCompressor", () => {
  it("returns messages unchanged when below threshold", async () => {
    const llm = makeMockLLM("summary");
    const compressor = new LLMContextCompressor(llm, { threshold: 10000 });
    const messages = makeMessages(4);
    const result = await compressor.compress(messages);
    expect(result).toBe(messages);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("compresses when token count exceeds threshold", async () => {
    const llm = makeMockLLM("This is a summary.");
    const compressor = new LLMContextCompressor(llm, { threshold: 1, keepRecentPairs: 1 });
    const messages = makeMessages(8); // 4 user + 4 assistant
    const result = await compressor.compress(messages);

    expect(llm.complete).toHaveBeenCalledOnce();
    // head (1) + summary (1) + tail (keepRecentPairs*2 = 2) = 4
    expect(result.length).toBe(4);
    // First message is preserved
    expect(result[0]).toBe(messages[0]);
  });

  it("inserts a summary message between head and tail", async () => {
    const summaryText = "compressed summary here";
    const llm = makeMockLLM(summaryText);
    const compressor = new LLMContextCompressor(llm, { threshold: 1, keepRecentPairs: 1 });
    const messages = makeMessages(8);
    const result = await compressor.compress(messages);

    const summaryMsg = result[1];
    expect(summaryMsg?.role).toBe("user");
    expect(typeof summaryMsg?.content).toBe("string");
    expect((summaryMsg?.content as string)).toContain(summaryText);
  });

  it("returns messages unchanged when middle is empty", async () => {
    const llm = makeMockLLM("summary");
    // keepRecentPairs=4 means keep 8 msgs — same as total, so middle is empty
    const compressor = new LLMContextCompressor(llm, { threshold: 1, keepRecentPairs: 4 });
    const messages = makeMessages(8);
    const result = await compressor.compress(messages);
    expect(result).toBe(messages);
  });

  it("uses default threshold of 6000 tokens", async () => {
    const llm = makeMockLLM("summary");
    const compressor = new LLMContextCompressor(llm);
    // Short messages — well under 6000 tokens
    const messages = makeMessages(4);
    await compressor.compress(messages);
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
