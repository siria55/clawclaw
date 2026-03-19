import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnthropicProvider } from "../../src/llm/anthropic.js";

// Stub the Anthropic SDK so no real HTTP calls are made
vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation((opts: Record<string, unknown>) => ({
      _opts: opts,
      messages: { create },
    })),
    __create: create,
  };
});

async function getInternals(): Promise<{
  MockAnthropic: { new (opts: unknown): { _opts: Record<string, unknown> } };
  create: ReturnType<typeof vi.fn>;
}> {
  const mod = await import("@anthropic-ai/sdk");
  return {
    MockAnthropic: (mod as unknown as { default: typeof MockAnthropic }).default,
    create: (mod as unknown as { __create: ReturnType<typeof vi.fn> }).__create,
  };
}

type MockAnthropic = { new (opts: unknown): { _opts: Record<string, unknown> } };

describe("AnthropicProvider — proxy & baseURL", () => {
  beforeEach(() => {
    delete process.env["ANTHROPIC_BASE_URL"];
    delete process.env["HTTPS_PROXY"];
    delete process.env["HTTP_PROXY"];
    delete process.env["ANTHROPIC_API_KEY"];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes baseURL config to Anthropic SDK", async () => {
    const { MockAnthropic } = await getInternals();
    new AnthropicProvider({ baseURL: "https://my-proxy.example.com", apiKey: "test" });
    const instance = vi.mocked(MockAnthropic).mock.results[0]?.value as { _opts: Record<string, unknown> };
    expect(instance._opts["baseURL"]).toBe("https://my-proxy.example.com");
  });

  it("reads baseURL from ANTHROPIC_BASE_URL env var", async () => {
    process.env["ANTHROPIC_BASE_URL"] = "https://env-proxy.example.com";
    const { MockAnthropic } = await getInternals();
    new AnthropicProvider({ apiKey: "test" });
    const instance = vi.mocked(MockAnthropic).mock.results[0]?.value as { _opts: Record<string, unknown> };
    expect(instance._opts["baseURL"]).toBe("https://env-proxy.example.com");
  });

  it("does not set baseURL when neither config nor env is provided", async () => {
    const { MockAnthropic } = await getInternals();
    new AnthropicProvider({ apiKey: "test" });
    const instance = vi.mocked(MockAnthropic).mock.results[0]?.value as { _opts: Record<string, unknown> };
    expect(instance._opts["baseURL"]).toBeUndefined();
  });

  it("config baseURL takes precedence over env var", async () => {
    process.env["ANTHROPIC_BASE_URL"] = "https://env-proxy.example.com";
    const { MockAnthropic } = await getInternals();
    new AnthropicProvider({ baseURL: "https://config-proxy.example.com", apiKey: "test" });
    const instance = vi.mocked(MockAnthropic).mock.results[0]?.value as { _opts: Record<string, unknown> };
    expect(instance._opts["baseURL"]).toBe("https://config-proxy.example.com");
  });

  it("encodes internal tool results as Anthropic tool_result blocks", async () => {
    const { create } = await getInternals();
    create.mockResolvedValue({
      content: [{ type: "text", text: "done" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const provider = new AnthropicProvider({ apiKey: "test" });
    await provider.complete({
      system: "sys",
      messages: [{
        role: "tool",
        content: [{
          toolCallId: "call_1",
          toolName: "memory_search",
          result: { output: "命中 1 条记忆" },
        }],
      }],
    });

    const payload = create.mock.calls[0]?.[0] as { messages: Array<{ content: unknown }> };
    expect(payload.messages[0]?.content).toEqual([
      {
        type: "tool_result",
        tool_use_id: "call_1",
        content: "命中 1 条记忆",
      },
    ]);
  });
});
