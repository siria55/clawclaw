import OpenAI, { type ClientOptions } from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions/completions.js";
import type { LLMProvider, LLMConfig, LLMCompleteParams, LLMResponse, Message, ToolCall, ToolCallResult } from "./types.js";

const DEFAULT_MODEL = "gpt-5.2-chat-latest";
const DEFAULT_MAX_TOKENS = 8192;

interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

type AssistantBlock = TextBlock | ToolUseBlock;

export interface OpenAIConfig extends Partial<LLMConfig> {
  apiKey?: string;
  /** Override the OpenAI API base URL, e.g. for proxies or gateways. */
  baseURL?: string;
  /** HTTPS proxy URL. Falls back to HTTPS_PROXY / HTTP_PROXY env vars. */
  httpsProxy?: string;
}

/**
 * OpenAI Chat Completions adapter.
 *
 * Uses a `developer` message to carry the system prompt and supports function tools.
 */
export class OpenAIProvider implements LLMProvider {
  readonly #client: OpenAI;
  readonly #config: Required<LLMConfig>;

  constructor(config: OpenAIConfig = {}) {
    const baseURL = config.baseURL ?? process.env["OPENAI_BASE_URL"];
    const proxy = config.httpsProxy ?? process.env["HTTPS_PROXY"] ?? process.env["HTTP_PROXY"];
    const fetchOptions = proxy ? buildProxyFetchOptions(proxy) : undefined;

    const clientConfig: ClientOptions = {
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(baseURL ? { baseURL } : {}),
      ...(fetchOptions ? { fetchOptions } : {}),
    };

    this.#client = new OpenAI(clientConfig);
    this.#config = {
      model: config.model ?? DEFAULT_MODEL,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? 1,
    };
  }

  async complete(params: LLMCompleteParams): Promise<LLMResponse> {
    const tools = params.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    const response = await this.#client.chat.completions.create({
      model: this.#config.model,
      max_completion_tokens: this.#config.maxTokens,
      temperature: this.#config.temperature,
      messages: toOpenAIMessages(params.system, params.messages),
      ...(tools && tools.length > 0 ? { tools, parallel_tool_calls: true } : {}),
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("OpenAI returned no completion choices");

    const toolCalls = (choice.message.tool_calls ?? [])
      .filter(isFunctionToolCall)
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        input: parseToolCallArguments(call.function.arguments),
      }));

    const result: LLMResponse = {
      message: {
        role: "assistant",
        content: toInternalAssistantContent(choice.message.content, choice.message.refusal, toolCalls),
      },
      ...(response.usage ? {
        usage: {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        },
      } : {}),
    };

    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }

    return result;
  }
}

function toOpenAIMessages(system: string, messages: Message[]): ChatCompletionMessageParam[] {
  return [
    { role: "developer", content: system },
    ...messages.flatMap(toOpenAIMessage),
  ];
}

function toOpenAIMessage(message: Message): ChatCompletionMessageParam[] {
  if (message.role === "tool") {
    return toOpenAIToolMessages(message.content);
  }

  if (message.role === "assistant") {
    return [toOpenAIAssistantMessage(message.content)];
  }

  return [{
    role: "user",
    content: stringifyMessageContent(message.content),
  }];
}

function toOpenAIAssistantMessage(content: unknown): ChatCompletionAssistantMessageParam {
  if (typeof content === "string") {
    return { role: "assistant", content };
  }

  const blocks = Array.isArray(content) ? content : [];
  const text = blocks.filter(isTextBlock).map((block) => block.text).join("");
  const toolCalls = blocks.filter(isToolUseBlock).map((block) => ({
    id: block.id,
    type: "function" as const,
    function: {
      name: block.name,
      arguments: JSON.stringify(block.input ?? {}),
    },
  }));

  if (toolCalls.length > 0) {
    return {
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls,
    };
  }

  return {
    role: "assistant",
    content: text,
  };
}

function toOpenAIToolMessages(content: unknown): ChatCompletionToolMessageParam[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter(isToolCallResult)
    .map((item) => ({
      role: "tool",
      tool_call_id: item.toolCallId,
      content: formatToolResult(item.result),
    }));
}

function toInternalAssistantContent(
  content: string | null,
  refusal: string | null,
  toolCalls: ToolCall[],
): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];

  if (content) {
    blocks.push({ type: "text", text: content });
  }

  if (refusal) {
    blocks.push({ type: "text", text: refusal });
  }

  for (const call of toolCalls) {
    blocks.push({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: call.input,
    });
  }

  return blocks;
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content.filter(isTextBlock).map((block) => block.text).join("");
    if (text) return text;
  }
  return JSON.stringify(content);
}

function parseToolCallArguments(argumentsText: string): unknown {
  if (!argumentsText) return {};
  try {
    return JSON.parse(argumentsText) as unknown;
  } catch {
    return argumentsText;
  }
}

function isFunctionToolCall(call: unknown): call is ChatCompletionMessageFunctionToolCall {
  if (!call || typeof call !== "object" || Array.isArray(call)) return false;
  const record = call as Record<string, unknown>;
  return record["type"] === "function"
    && typeof record["id"] === "string"
    && typeof record["function"] === "object";
}

function isTextBlock(value: unknown): value is TextBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record["type"] === "text" && typeof record["text"] === "string";
}

function isToolUseBlock(value: unknown): value is ToolUseBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record["type"] === "tool_use"
    && typeof record["id"] === "string"
    && typeof record["name"] === "string";
}

function isToolCallResult(value: unknown): value is ToolCallResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record["toolCallId"] === "string"
    && typeof record["toolName"] === "string"
    && typeof record["result"] === "object";
}

function formatToolResult(result: ToolCallResult["result"]): string {
  if (result.output) return result.output;
  if (result.error) return result.error;
  return JSON.stringify(result);
}

function buildProxyFetchOptions(proxyUrl: string): ClientOptions["fetchOptions"] | undefined {
  const dispatcher = buildProxyDispatcher(proxyUrl);
  if (!dispatcher) return undefined;
  return { dispatcher } as ClientOptions["fetchOptions"];
}

function buildProxyDispatcher(proxyUrl: string): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ProxyAgent } = require("undici") as {
      ProxyAgent: new (uri: string) => unknown;
    };
    return new ProxyAgent(proxyUrl);
  } catch {
    console.warn(
      `[clawclaw] HTTPS_PROXY set but "undici" proxy support is unavailable. ` +
        `Run: npm install undici`,
    );
    return undefined;
  }
}
