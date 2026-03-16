import type { z } from "zod";

export interface ToolResult {
  /** Successful output */
  output?: string;
  /** Error message if execution failed */
  error?: string;
}

export interface Tool<TInput = unknown> {
  /** Unique tool name (snake_case) */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** JSON Schema for input validation */
  inputSchema: Record<string, unknown>;
  /** Execute the tool with validated input */
  execute(input: TInput): Promise<ToolResult>;
}

/**
 * Helper to define a type-safe tool with Zod input validation.
 */
export function defineTool<TSchema extends z.ZodType>(opts: {
  name: string;
  description: string;
  schema: TSchema;
  execute(input: z.infer<TSchema>): Promise<ToolResult>;
}): Tool<z.infer<TSchema>> {
  return {
    name: opts.name,
    description: opts.description,
    inputSchema: zodToJsonSchema(opts.schema),
    execute: async (input: unknown) => {
      const parsed = opts.schema.safeParse(input);
      if (!parsed.success) {
        return { error: `Invalid input: ${parsed.error.message}` };
      }
      return opts.execute(parsed.data as z.infer<TSchema>);
    },
  };
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Minimal inline conversion — avoids extra deps.
  // For complex schemas, swap in zod-to-json-schema package.
  const def = (schema as unknown as { _def: { typeName: string } })._def;
  if (def.typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(val as z.ZodType);
      const valDef = (val as unknown as { _def: { typeName: string } })._def;
      if (valDef.typeName !== "ZodOptional") required.push(key);
    }
    return { type: "object", properties, required };
  }
  if (def.typeName === "ZodString") return { type: "string" };
  if (def.typeName === "ZodNumber") return { type: "number" };
  if (def.typeName === "ZodBoolean") return { type: "boolean" };
  if (def.typeName === "ZodOptional") {
    const inner = (schema as z.ZodOptional<z.ZodType>).unwrap();
    return zodToJsonSchema(inner);
  }
  return {};
}
