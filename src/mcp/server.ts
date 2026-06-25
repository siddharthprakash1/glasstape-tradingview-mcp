import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { GlasstapeContext } from "../context.js";
import { allTools } from "../domains/index.js";
import { isGlasstapeError } from "../util/errors.js";
import { log } from "../util/logger.js";
import type { ToolDef, ToolResult } from "./registry.js";

const SERVER_INFO = { name: "glasstape", version: "0.1.0" };

function jsonSchemaFor(tool: ToolDef): Record<string, unknown> {
  const schema = zodToJsonSchema(z.object(tool.input), { target: "jsonSchema7" }) as Record<
    string,
    unknown
  >;
  delete schema.$schema;
  return schema;
}

/** Convert a ToolResult into MCP content blocks. */
function toContent(result: ToolResult): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];
  if (result.text) content.push({ type: "text", text: result.text });
  if (result.image) {
    content.push({ type: "image", data: result.image.base64, mimeType: result.image.mimeType });
  }
  if (result.data !== undefined) {
    content.push({ type: "text", text: JSON.stringify(result.data, null, 2) });
  }
  if (content.length === 0) content.push({ type: "text", text: "(no output)" });
  return content;
}

/** Build the configured MCP server (transport not yet connected). */
export function buildServer(ctx: GlasstapeContext): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
  const byName = new Map(allTools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: jsonSchemaFor(t),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    try {
      const args = z.object(tool.input).parse(req.params.arguments ?? {});
      const result = await tool.handler(ctx, args);
      return { content: toContent(result) };
    } catch (e) {
      const code = e instanceof z.ZodError ? "INVALID_INPUT" : isGlasstapeError(e) ? e.code : "EVAL_FAILED";
      const message =
        e instanceof z.ZodError
          ? `Invalid arguments: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
          : isGlasstapeError(e)
            ? e.toUserString()
            : e instanceof Error
              ? e.message
              : String(e);
      log.warn(`tool ${tool.name} failed [${code}]: ${message}`);
      // Surface the machine-readable code both in the text (for the model) and as
      // structuredContent (for programmatic clients) — the diagnosis is the point.
      return {
        content: [{ type: "text", text: `Error [${code}]: ${message}` }],
        structuredContent: { ok: false, code },
        isError: true,
      };
    }
  });

  return server;
}

/** Start the stdio MCP server and block until the transport closes. */
export async function startServer(ctx: GlasstapeContext): Promise<void> {
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(`glasstape MCP server ready on stdio · ${allTools.length} tools · CDP ${ctx.cfg.host}:${ctx.cfg.port}`);
}
