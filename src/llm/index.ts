export { AnthropicProvider } from "./anthropic.js";
export type { LLMProvider, LLMConfig, Message, LLMResponse } from "./types.js";

import { AnthropicProvider } from "./anthropic.js";
import type { LLMConfig, LLMProvider } from "./types.js";

/**
 * Factory: creates an LLM provider by name.
 * Currently supports: "anthropic"
 */
export function createLLM(
  provider: "anthropic",
  config?: Partial<LLMConfig> & { apiKey?: string },
): LLMProvider {
  if (provider === "anthropic") {
    return new AnthropicProvider(config);
  }
  throw new Error(`Unknown LLM provider: ${String(provider)}`);
}
