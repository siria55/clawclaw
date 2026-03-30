export { AnthropicProvider } from "./anthropic.js";
export { OpenAIProvider } from "./openai.js";
export type { LLMProvider, LLMConfig, LLMProviderName, Message, LLMResponse } from "./types.js";

import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import type { LLMConfig, LLMProvider, LLMProviderName } from "./types.js";

export interface LLMProviderConfig extends Partial<LLMConfig> {
  apiKey?: string;
  baseURL?: string;
  httpsProxy?: string;
}

export interface LLMProviderStorageConfig extends LLMProviderConfig {
  provider?: string;
}

export function isLLMProviderName(value: unknown): value is LLMProviderName {
  return value === "anthropic" || value === "openai";
}

export function resolveLLMProvider(
  config: Pick<LLMProviderStorageConfig, "provider"> = {},
  env: NodeJS.ProcessEnv = process.env,
): LLMProviderName {
  if (isLLMProviderName(config.provider)) return config.provider;
  if (isLLMProviderName(env["LLM_PROVIDER"])) return env["LLM_PROVIDER"];
  return "anthropic";
}

/**
 * Factory: creates an LLM provider by name.
 * Currently supports: "anthropic" and "openai"
 */
export function createLLM(
  provider: LLMProviderName,
  config: LLMProviderConfig = {},
): LLMProvider {
  if (provider === "anthropic") {
    return new AnthropicProvider(config);
  }
  if (provider === "openai") {
    return new OpenAIProvider(config);
  }
  throw new Error(`Unknown LLM provider: ${String(provider)}`);
}

export function createLLMFromConfig(
  config: LLMProviderStorageConfig = {},
  env: NodeJS.ProcessEnv = process.env,
): LLMProvider {
  const { apiKey, baseURL, httpsProxy, model, maxTokens, temperature } = config;
  return createLLM(resolveLLMProvider(config, env), {
    ...(apiKey !== undefined && { apiKey }),
    ...(baseURL !== undefined && { baseURL }),
    ...(httpsProxy !== undefined && { httpsProxy }),
    ...(model !== undefined && { model }),
    ...(maxTokens !== undefined && { maxTokens }),
    ...(temperature !== undefined && { temperature }),
  });
}
