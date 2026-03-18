import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMConfig, LLMCompleteParams, LLMResponse, ToolCall } from "./types.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 8192;

export interface AnthropicConfig extends Partial<LLMConfig> {
  apiKey?: string;
  /** Override the Anthropic API base URL, e.g. for proxies or mirrors. */
  baseURL?: string;
  /** HTTPS proxy URL. Falls back to HTTPS_PROXY / HTTP_PROXY env vars. */
  httpsProxy?: string;
}

/**
 * Anthropic Claude LLM adapter.
 *
 * Proxy support: set HTTPS_PROXY / HTTP_PROXY env vars, or pass baseURL directly.
 */
export class AnthropicProvider implements LLMProvider {
  readonly #client: Anthropic;
  readonly #config: Required<LLMConfig>;

  constructor(config: AnthropicConfig = {}) {
    const baseURL = config.baseURL ?? process.env["ANTHROPIC_BASE_URL"];
    const proxy = config.httpsProxy ?? process.env["HTTPS_PROXY"] ?? process.env["HTTP_PROXY"];

    this.#client = new Anthropic({
      apiKey: config.apiKey,
      ...(baseURL ? { baseURL } : {}),
      ...(proxy ? { httpAgent: buildProxyAgent(proxy) as import("node:http").Agent } : {}),
    });

    this.#config = {
      model: config.model ?? DEFAULT_MODEL,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? 1,
    };
  }

  async complete(params: LLMCompleteParams): Promise<LLMResponse> {
    const rawTools = params.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }));

    const hasTools = rawTools && rawTools.length > 0;

    const response = await this.#client.messages.create({
      model: this.#config.model,
      max_tokens: this.#config.maxTokens,
      system: params.system,
      messages: params.messages.map(toAnthropicMessage),
      ...(hasTools ? { tools: rawTools } : {}),
    });

    const toolCalls: ToolCall[] = response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
      .map((block) => ({ id: block.id, name: block.name, input: block.input }));

    const result: LLMResponse = {
      message: { role: "assistant", content: response.content },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };

    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }

    return result;
  }
}

function toAnthropicMessage(msg: import("./types.js").Message): Anthropic.MessageParam {
  if (msg.role === "tool") {
    return {
      role: "user",
      content: msg.content as Anthropic.ToolResultBlockParam[],
    };
  }
  return {
    role: msg.role as "user" | "assistant",
    content: msg.content as string | Anthropic.ContentBlock[],
  };
}

function buildProxyAgent(proxyUrl: string): unknown {
  // Node.js 22+ supports native fetch with proxy via NODE_OPTIONS / --env-file.
  // For older setups, the caller can install `https-proxy-agent` and pass it here.
  // We dynamically require to keep it an optional peer dep.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HttpsProxyAgent } = require("https-proxy-agent") as {
      HttpsProxyAgent: new (url: string) => unknown;
    };
    return new HttpsProxyAgent(proxyUrl);
  } catch {
    console.warn(
      `[clawclaw] HTTPS_PROXY set but "https-proxy-agent" is not installed. ` +
        `Run: npm install https-proxy-agent`,
    );
    return undefined;
  }
}
