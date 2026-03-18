import type { AgentConfig, AgentOptions, AgentRunResult, AgentEvent } from "./types.js";
import type { LLMProvider } from "../llm/types.js";
import type { Message } from "../llm/types.js";

const DEFAULT_MAX_TURNS = 20;

/**
 * Core agent that orchestrates LLM + tool calls in a loop.
 *
 * @example
 * ```ts
 * const agent = new Agent({ name: "assistant", system: "...", llm });
 * const result = await agent.run("Hello");
 * ```
 */
export class Agent {
  readonly name: string;
  readonly #config: AgentConfig;
  #llm: LLMProvider;
  #systemFn: (() => string) | undefined;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.#config = config;
    this.#llm = config.llm;
  }

  /** Hot-swap the LLM provider without restarting the agent. */
  updateLLM(provider: LLMProvider): void {
    this.#llm = provider;
  }

  /** Hot-replace the system prompt function without restarting the agent. */
  updateSystem(fn: () => string): void {
    this.#systemFn = fn;
  }

  /**
   * Run the agent until the LLM stops calling tools or maxTurns is reached.
   */
  async run(userMessage: string, options: AgentOptions = {}): Promise<AgentRunResult> {
    const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
    let messages: Message[] = [
      ...(options.history ?? []),
      { role: "user", content: userMessage },
    ];
    let turns = 0;

    while (turns < maxTurns) {
      if (this.#config.compressor) {
        messages = await this.#config.compressor.compress(messages);
      }

      const system = await this.#resolveSystem();
      const contextMessages = this.#config.getContext ? await this.#config.getContext(messages) : [];

      const response = await this.#llm.complete({
        system,
        messages: [...messages, ...contextMessages],
        ...(this.#config.tools ? { tools: this.#config.tools } : {}),
      });

      messages.push(response.message);
      turns++;

      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      const toolResults = await this.#executeTools(response.toolCalls);
      messages.push({ role: "tool", content: toolResults });
    }

    return { messages, turns };
  }

  /**
   * Run the agent and emit events as they occur.
   */
  async *stream(userMessage: string, options: AgentOptions = {}): AsyncGenerator<AgentEvent> {
    const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
    let messages: Message[] = [{ role: "user", content: userMessage }];
    let turns = 0;

    while (turns < maxTurns) {
      if (this.#config.compressor) {
        messages = await this.#config.compressor.compress(messages);
      }

      const system = await this.#resolveSystem();
      const contextMessages = this.#config.getContext ? await this.#config.getContext(messages) : [];

      const response = await this.#llm.complete({
        system,
        messages: [...messages, ...contextMessages],
        ...(this.#config.tools ? { tools: this.#config.tools } : {}),
      });

      messages.push(response.message);
      yield { type: "message", message: response.message };
      turns++;

      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      for (const call of response.toolCalls) {
        yield { type: "tool_call", toolName: call.name, input: call.input };
      }

      const toolResults = await this.#executeTools(response.toolCalls);
      for (const result of toolResults) {
        yield { type: "tool_result", toolName: result.toolName, result: result.result };
      }

      messages.push({ role: "tool", content: toolResults });
    }

    const result: AgentRunResult = { messages, turns };
    yield { type: "done", result };
  }

  async #resolveSystem(): Promise<string> {
    if (this.#systemFn) return this.#systemFn();
    return typeof this.#config.system === "function"
      ? this.#config.system()
      : this.#config.system;
  }

  async #executeTools(
    calls: NonNullable<Awaited<ReturnType<AgentConfig["llm"]["complete"]>>["toolCalls"]>,
  ): Promise<Array<{ toolName: string; result: import("../tools/types.js").ToolResult }>> {
    const tools = this.#config.tools ?? [];

    return Promise.all(
      calls.map(async (call) => {
        const tool = tools.find((t) => t.name === call.name);
        if (!tool) {
          return { toolName: call.name, result: { error: `Tool "${call.name}" not found` } };
        }
        try {
          const result = await tool.execute(call.input);
          return { toolName: call.name, result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { toolName: call.name, result: { error: message } };
        }
      }),
    );
  }
}
