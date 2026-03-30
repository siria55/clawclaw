import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "../../src/llm/openai.js";
import type { Tool } from "../../src/tools/types.js";

vi.mock("openai", () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation((opts: Record<string, unknown>) => ({
      _opts: opts,
      chat: { completions: { create } },
    })),
    __create: create,
  };
});

async function getInternals(): Promise<{
  MockOpenAI: { new (opts: unknown): { _opts: Record<string, unknown> } };
  create: ReturnType<typeof vi.fn>;
}> {
  const mod = await import("openai");
  return {
    MockOpenAI: (mod as unknown as { default: typeof MockOpenAI }).default,
    create: (mod as unknown as { __create: ReturnType<typeof vi.fn> }).__create,
  };
}

type MockOpenAI = { new (opts: unknown): { _opts: Record<string, unknown> } };

const memorySearchTool: Tool = {
  name: "memory_search",
  description: "Search saved memory entries",
  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string" },
    },
    required: ["q"],
  },
  execute: vi.fn(async () => ({ output: "unused" })),
};

describe("OpenAIProvider", () => {
  beforeEach(() => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["HTTPS_PROXY"];
    delete process.env["HTTP_PROXY"];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes baseURL config to OpenAI SDK", async () => {
    const { MockOpenAI } = await getInternals();
    new OpenAIProvider({ baseURL: "https://gateway.example.com/v1", apiKey: "test" });
    const instance = vi.mocked(MockOpenAI).mock.results[0]?.value as { _opts: Record<string, unknown> };
    expect(instance._opts["baseURL"]).toBe("https://gateway.example.com/v1");
  });

  it("reads baseURL from OPENAI_BASE_URL env var", async () => {
    process.env["OPENAI_BASE_URL"] = "https://env-gateway.example.com/v1";
    const { MockOpenAI } = await getInternals();
    new OpenAIProvider({ apiKey: "test" });
    const instance = vi.mocked(MockOpenAI).mock.results[0]?.value as { _opts: Record<string, unknown> };
    expect(instance._opts["baseURL"]).toBe("https://env-gateway.example.com/v1");
  });

  it("passes HTTPS proxy via fetchOptions.dispatcher", async () => {
    const { MockOpenAI } = await getInternals();
    new OpenAIProvider({ apiKey: "test", httpsProxy: "http://127.0.0.1:7890" });
    const instance = vi.mocked(MockOpenAI).mock.results[0]?.value as {
      _opts: { fetchOptions?: { dispatcher?: unknown } };
    };
    expect(instance._opts.fetchOptions?.dispatcher).toBeDefined();
  });

  it("encodes internal tool results as tool messages and parses function tool calls", async () => {
    const { create } = await getInternals();
    create.mockResolvedValue({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          refusal: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: {
              name: "memory_search",
              arguments: "{\"q\":\"日报\"}",
            },
          }],
        },
      }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    });

    const provider = new OpenAIProvider({ apiKey: "test" });
    const result = await provider.complete({
      system: "sys",
      messages: [{
        role: "tool",
        content: [{
          toolCallId: "call_prev",
          toolName: "memory_get",
          result: { output: "命中 1 条记忆" },
        }],
      }],
      tools: [memorySearchTool],
    });

    const payload = create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content?: unknown; tool_call_id?: string }>;
      tools: Array<{
        type: string;
        function: { name: string; description: string; parameters: Record<string, unknown> };
      }>;
    };

    expect(payload.messages[0]).toEqual({ role: "developer", content: "sys" });
    expect(payload.messages[1]).toEqual({
      role: "tool",
      tool_call_id: "call_prev",
      content: "命中 1 条记忆",
    });
    expect(payload.tools).toEqual([{
      type: "function",
      function: {
        name: "memory_search",
        description: "Search saved memory entries",
        parameters: memorySearchTool.inputSchema,
      },
    }]);

    expect(result.toolCalls).toEqual([{
      id: "call_1",
      name: "memory_search",
      input: { q: "日报" },
    }]);
    expect(result.message).toEqual({
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "call_1",
        name: "memory_search",
        input: { q: "日报" },
      }],
    });
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  });

  it("surfaces upstream error payloads when choices are missing", async () => {
    const { create } = await getInternals();
    create.mockResolvedValue({
      error: {
        message: "invalid api key",
        type: "authentication_error",
      },
    });

    const provider = new OpenAIProvider({ apiKey: "test" });

    await expect(provider.complete({
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
    })).rejects.toThrow("OpenAI returned an invalid response: invalid api key");
  });
});
