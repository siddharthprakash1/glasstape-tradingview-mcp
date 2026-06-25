import { z } from "zod";
import { defineTool } from "../mcp/registry.js";

/** Pine Script editor tools. */

export const pineSetSource = defineTool({
  name: "pine_set_source",
  description:
    "Write Pine Script source into the open Pine Editor (Monaco). The Pine Editor must be open in TradingView. Returns how the write was performed.",
  input: {
    source: z.string().min(1).describe("Full Pine Script source to place in the editor."),
  },
  handler: async (ctx, args) => {
    const result = await ctx.pine.setSource(args.source);
    return { text: `Pine source written via ${result.method}.`, data: result };
  },
});

export const pineGetConsole = defineTool({
  name: "pine_get_console",
  description: "Read the Pine Editor console output lines (compile messages, logs).",
  input: {},
  handler: async (ctx) => {
    const console = await ctx.pine.getConsole();
    return {
      text: console.lines.length ? console.lines.join("\n") : "Pine console is empty.",
      data: console,
    };
  },
});

export const pineGetErrors = defineTool({
  name: "pine_get_errors",
  description: "Read Pine compile error markers currently shown in the editor, if any.",
  input: {},
  handler: async (ctx) => {
    const errors = await ctx.pine.getErrors();
    return {
      text: errors.length ? errors.map((e) => `✗ ${e}`).join("\n") : "No Pine errors detected.",
      data: { errors },
    };
  },
});

export const pineTools = [pineSetSource, pineGetConsole, pineGetErrors];
