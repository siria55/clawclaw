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
});
