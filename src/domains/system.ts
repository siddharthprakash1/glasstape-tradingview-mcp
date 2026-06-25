import { z } from "zod";
import { defineTool } from "../mcp/registry.js";
import { runHealthCheck } from "../health/check.js";

/** Connection, diagnostics and advanced/escape-hatch tools. */

export const health = defineTool({
  name: "health",
  description:
    "Check the full bridge: CDP connection, that the target is TradingView, the detected version, and whether all UI selectors still resolve. Run this first if anything misbehaves.",
  input: {},
  handler: async (ctx) => {
    const report = await runHealthCheck(ctx);
    const summary = report.ok
      ? `Healthy — connected to "${report.cdp.targetTitle ?? "TradingView"}", ${report.selectorsOk}/${report.selectorsTotal} selectors OK${report.version ? `, v${report.version}` : ""}.`
      : `Unhealthy — ${report.issues[0] ?? "see details."}`;
    return { text: summary, data: report };
  },
});

export const listTargets = defineTool({
  name: "list_targets",
  description: "List the Chrome DevTools targets exposed on the debug port (for diagnostics).",
  input: {},
  handler: async (ctx) => {
    const targets = await ctx.cdp.listTargets();
    const slim = targets.map((t) => ({ type: t.type, title: t.title, url: t.url }));
    return { text: `${targets.length} target(s) found.`, data: slim };
  },
});

export const tvEvaluate = defineTool({
  name: "tv_evaluate",
  description:
    "ADVANCED escape hatch: evaluate a JavaScript expression inside the TradingView page and return its JSON-serialisable value. Use for reading state the dedicated tools don't expose. The expression must evaluate to a value (wrap statements in an IIFE).",
  input: {
    expression: z.string().min(1).describe("A JS expression, e.g. (() => document.title)()."),
  },
  handler: async (ctx, args) => {
    const value = await ctx.cdp.evaluate(args.expression);
    return { text: "Evaluated.", data: value };
  },
});

export const systemTools = [health, listTargets, tvEvaluate];
