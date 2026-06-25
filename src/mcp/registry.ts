import { z } from "zod";
import type { GlasstapeContext } from "../context.js";

/**
 * A tool's structured result. The server turns this into MCP content blocks:
 * `text` becomes a text block, `data` is pretty-printed JSON, `image` becomes an
 * image block. A tool may set any combination.
 */
export interface ToolResult {
  text?: string;
  data?: unknown;
  image?: { base64: string; mimeType: string };
}

/**
 * A typed tool definition. `input` is a Zod raw shape; the handler receives the
 * parsed, validated arguments — no manual casting at call sites.
 */
export interface ToolDef<TShape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  input: TShape;
  handler: (ctx: GlasstapeContext, args: z.infer<z.ZodObject<TShape>>) => Promise<ToolResult>;
}

/** Identity helper that preserves the generic shape for inference at call sites. */
export function defineTool<TShape extends z.ZodRawShape>(def: ToolDef<TShape>): ToolDef<TShape> {
  return def;
}

/** Assert tool names are unique; throws on a duplicate (a programming error). */
export function assertUniqueNames(tools: ReadonlyArray<{ name: string }>): void {
  const seen = new Set<string>();
  for (const t of tools) {
    if (seen.has(t.name)) throw new Error(`Duplicate tool name: ${t.name}`);
    seen.add(t.name);
  }
}
