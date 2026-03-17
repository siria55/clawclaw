import { describe, it, expect, vi } from "vitest";
import { Agent } from "../../src/core/agent.js";
import type { LLMProvider, LLMResponse, Message } from "../../src/llm/types.js";
import type { Tool } from "../../src/tools/types.js";

function makeMockLLM(responses: LLMResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    complete: vi.fn(async () => {
      const response = responses[callIndex++];
      if (!response) throw new Error("No more mock responses");
      return response;
    }),
  };
}

function makeTextResponse(text: string): LLMResponse {
  return {
    message: { role: "assistant", content: [{ type: "text", text }] },
  };
}

function makeToolCallResponse(toolName: string, input: unknown): LLMResponse {
  return {
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: "call_1", name: toolName, input }],
    },
    toolCalls: [{ id: "call_1", name: toolName, input }],
  };
}

describe("Agent", () => {
  it("returns result after single LLM turn with no tools", async () => {
    const llm = makeMockLLM([makeTextResponse("Hello!")]);
    const agent = new Agent({ name: "test", system: "You are helpful.", llm, compressor: undefined });

    const result = await agent.run("Hi");

    expect(result.turns).toBe(1);
    expect(result.messages).toHaveLength(2); // user + assistant
  });

  it("executes a tool and continues the conversation", async () => {
    const echoTool: Tool = {
      name: "echo",
      description: "Echo input back",
      inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      execute: async (input) => ({ output: (input as { text: string }).text }),
    };

    const llm = makeMockLLM([
      makeToolCallResponse("echo", { text: "ping" }),
      makeTextResponse("pong"),
    ]);

    const agent = new Agent({ name: "test", system: "You are helpful.", llm, tools: [echoTool], compressor: undefined });
    const result = await agent.run("Echo ping");

    expect(result.turns).toBe(2);
  });

  it("returns error in tool result when tool is not found", async () => {
    const llm = makeMockLLM([
      makeToolCallResponse("missing_tool", {}),
      makeTextResponse("done"),
    ]);

    const agent = new Agent({ name: "test", system: "You are helpful.", llm, compressor: undefined });
    const result = await agent.run("Call missing tool");

    expect(result.turns).toBe(2);
  });

  it("stops at maxTurns to prevent infinite loops", async () => {
    const responses = Array.from({ length: 5 }, (_, i) =>
      makeToolCallResponse("echo", { text: `turn ${i}` }),
    );
    const echoTool: Tool = {
      name: "echo",
      description: "Echo",
      inputSchema: {},
      execute: async () => ({ output: "ok" }),
    };

    const llm = makeMockLLM([...responses, makeTextResponse("done")]);
    const agent = new Agent({ name: "test", system: "You are helpful.", llm, tools: [echoTool], compressor: undefined });

    const result = await agent.run("Go", { maxTurns: 3 });

    expect(result.turns).toBe(3);
  });

  it("emits events in stream mode", async () => {
    const llm = makeMockLLM([makeTextResponse("Hello!")]);
    const agent = new Agent({ name: "test", system: "You are helpful.", llm, compressor: undefined });

    const events: string[] = [];
    for await (const event of agent.stream("Hi")) {
      events.push(event.type);
    }

    expect(events).toEqual(["message", "done"]);
  });

  describe("constructor", () => {
    it("sets agent name from config", () => {
      const llm = makeMockLLM([]);
      const agent = new Agent({ name: "my-agent", system: "sys", llm, compressor: undefined });
      expect(agent.name).toBe("my-agent");
    });
  });

  describe("dynamic system prompt", () => {
    it("calls system function before each LLM turn", async () => {
      let callCount = 0;
      const systemFn = vi.fn(() => {
        callCount++;
        return `system v${callCount}`;
      });

      const llm = makeMockLLM([
        makeToolCallResponse("echo", {}),
        makeTextResponse("done"),
      ]);
      const echoTool: Tool = {
        name: "echo",
        description: "Echo",
        inputSchema: {},
        execute: async () => ({ output: "ok" }),
      };

      const agent = new Agent({ name: "test", system: systemFn, llm, tools: [echoTool], compressor: undefined });
      await agent.run("go");

      expect(systemFn).toHaveBeenCalledTimes(2);
      const calls = vi.mocked(llm.complete).mock.calls;
      expect(calls[0][0].system).toBe("system v1");
      expect(calls[1][0].system).toBe("system v2");
    });

    it("supports async system function", async () => {
      const systemFn = async () => "async system";
      const llm = makeMockLLM([makeTextResponse("ok")]);
      const agent = new Agent({ name: "test", system: systemFn, llm, compressor: undefined });
      await agent.run("hi");
      expect(vi.mocked(llm.complete).mock.calls[0][0].system).toBe("async system");
    });

    it("updateSystem() overrides system prompt from next run", async () => {
      const llm = makeMockLLM([makeTextResponse("ok"), makeTextResponse("ok2")]);
      const agent = new Agent({ name: "test", system: "original", llm, compressor: undefined });

      await agent.run("first");
      expect(vi.mocked(llm.complete).mock.calls[0][0].system).toBe("original");

      agent.updateSystem(() => "updated");
      await agent.run("second");
      expect(vi.mocked(llm.complete).mock.calls[1][0].system).toBe("updated");
    });
  });

  describe("getContext hook", () => {
    it("injects context messages into LLM call", async () => {
      const injected: Message = { role: "user", content: "[context] relevant info" };
      const getContext = vi.fn(async () => [injected]);

      const llm = makeMockLLM([makeTextResponse("ok")]);
      const agent = new Agent({ name: "test", system: "sys", llm, compressor: undefined, getContext });
      await agent.run("hi");

      const callMessages = vi.mocked(llm.complete).mock.calls[0][0].messages;
      expect(callMessages).toContainEqual(injected);
    });

    it("context messages are NOT written into AgentRunResult.messages", async () => {
      const injected: Message = { role: "user", content: "[ephemeral context]" };
      const getContext = vi.fn(async () => [injected]);

      const llm = makeMockLLM([makeTextResponse("ok")]);
      const agent = new Agent({ name: "test", system: "sys", llm, compressor: undefined, getContext });
      const result = await agent.run("hi");

      const contents = result.messages.map((m) => m.content);
      expect(contents).not.toContain("[ephemeral context]");
    });

    it("getContext receives current message history", async () => {
      const captured: Message[][] = [];
      const getContext = vi.fn(async (msgs: Message[]) => {
        captured.push([...msgs]);
        return [];
      });

      const llm = makeMockLLM([makeTextResponse("ok")]);
      const agent = new Agent({ name: "test", system: "sys", llm, compressor: undefined, getContext });
      await agent.run("hello");

      expect(captured[0][0].content).toBe("hello");
    });
  });
});
