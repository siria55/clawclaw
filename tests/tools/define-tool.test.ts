import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool } from "../../src/tools/types.js";

describe("defineTool", () => {
  it("creates a tool with the correct name and description", () => {
    const tool = defineTool({
      name: "greet",
      description: "Greet someone",
      schema: z.object({ name: z.string() }),
      execute: async ({ name }) => ({ output: `Hello, ${name}!` }),
    });

    expect(tool.name).toBe("greet");
    expect(tool.description).toBe("Greet someone");
  });

  it("generates a JSON schema from the Zod schema", () => {
    const tool = defineTool({
      name: "add",
      description: "Add two numbers",
      schema: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => ({ output: String(a + b) }),
    });

    expect(tool.inputSchema).toMatchObject({
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
    });
  });

  it("executes successfully with valid input", async () => {
    const tool = defineTool({
      name: "greet",
      description: "Greet",
      schema: z.object({ name: z.string() }),
      execute: async ({ name }) => ({ output: `Hi ${name}` }),
    });

    const result = await tool.execute({ name: "Alice" });
    expect(result.output).toBe("Hi Alice");
  });

  it("returns an error result for invalid input", async () => {
    const tool = defineTool({
      name: "greet",
      description: "Greet",
      schema: z.object({ name: z.string() }),
      execute: async ({ name }) => ({ output: `Hi ${name}` }),
    });

    const result = await tool.execute({ name: 42 });
    expect(result.error).toMatch(/Invalid input/);
  });

  it("handles optional fields in schema", () => {
    const tool = defineTool({
      name: "search",
      description: "Search",
      schema: z.object({ query: z.string(), limit: z.number().optional() }),
      execute: async () => ({ output: "ok" }),
    });

    expect(tool.inputSchema).toMatchObject({
      type: "object",
      required: ["query"],
    });
  });
});
