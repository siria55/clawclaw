import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnthropicProvider } from "../../src/llm/anthropic.js";
import { createLLM, createLLMFromConfig, resolveLLMProvider } from "../../src/llm/index.js";
import { OpenAIProvider } from "../../src/llm/openai.js";

describe("llm factory helpers", () => {
  beforeEach(() => {
    delete process.env["LLM_PROVIDER"];
    delete process.env["OPENAI_API_KEY"];
  });

  afterEach(() => {
    delete process.env["LLM_PROVIDER"];
    delete process.env["OPENAI_API_KEY"];
  });

  it("createLLM returns AnthropicProvider for anthropic", () => {
    expect(createLLM("anthropic", { apiKey: "test" })).toBeInstanceOf(AnthropicProvider);
  });

  it("createLLM returns OpenAIProvider for openai", () => {
    expect(createLLM("openai", { apiKey: "test" })).toBeInstanceOf(OpenAIProvider);
  });

  it("resolveLLMProvider prefers saved config over env", () => {
    process.env["LLM_PROVIDER"] = "anthropic";
    expect(resolveLLMProvider({ provider: "openai" })).toBe("openai");
  });

  it("resolveLLMProvider falls back to env and then anthropic", () => {
    process.env["LLM_PROVIDER"] = "openai";
    expect(resolveLLMProvider()).toBe("openai");
    delete process.env["LLM_PROVIDER"];
    expect(resolveLLMProvider()).toBe("anthropic");
  });

  it("createLLMFromConfig uses env provider when storage is empty", () => {
    process.env["LLM_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "test";
    expect(createLLMFromConfig()).toBeInstanceOf(OpenAIProvider);
  });
});
