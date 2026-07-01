import { z } from "zod";
import { defineTool } from "../mcp/registry.js";

/** Indicators, chart type, drawings, alerts, replay and layout tools (Phase 2; best-effort UI automation). */

export const addIndicator = defineTool({
  name: "add_indicator",
  description: "Add a study/indicator to the chart by name (e.g. 'RSI', 'MACD', 'Bollinger Bands').",
  input: { name: z.string().min(1).describe("Indicator name to search for and add.") },
  handler: async (ctx, args) => {
    const r = await ctx.tv.addIndicator(args.name);
    return { text: `Added indicator: ${r.requested}.`, data: r };
  },
});

export const setChartType = defineTool({
  name: "set_chart_type",
  description: "Change the chart style: candles, bars, line, area, baseline, 'heikin ashi', 'hollow candles', etc.",
  input: { type: z.string().min(1).describe("Chart type label.") },
  handler: async (ctx, args) => {
    const r = await ctx.tv.setChartType(args.type);
    return { text: r.matched ? `Chart type → ${r.requested}.` : `No chart-type row matched '${r.requested}'.`, data: r };
  },
});

export const setLayout = defineTool({
  name: "set_layout",
  description: "Switch the multi-pane layout (e.g. '1', '2', '2v', '2x2'). Requires a TradingView plan with multi-chart grids.",
  input: { layout: z.string().min(1).describe("Layout spec.") },
  handler: async (ctx, args) => {
    const r = await ctx.tv.setLayout(args.layout);
    return { text: r.applied ? `Layout → ${r.requested}.` : (r.note ?? `Layout '${r.requested}' not applied.`), data: r };
  },
});

export const createAlert = defineTool({
  name: "create_alert",
  description: "Open the create-alert dialog on the current symbol (configuring the alert is manual).",
  input: {},
  handler: async (ctx) => {
    const r = await ctx.tv.createAlert();
    return { text: "Opened the alert dialog.", data: r };
  },
});

export const replay = defineTool({
  name: "replay",
  description: "Control Bar Replay: start (enter replay mode), step (one bar forward), play (autoplay), stop.",
  input: { action: z.enum(["start", "step", "play", "stop"]).describe("Replay action.") },
  handler: async (ctx, args) => {
    const r = await ctx.tv.replay(args.action);
    return { text: `Replay ${r.action}: ${r.ok ? "ok" : "control not found"}.`, data: r };
  },
});

export const addDrawing = defineTool({
  name: "add_drawing",
  description: "Add a drawing via TradingView's internal shape API (reliable): a horizontal line (optionally pinned to an exact price) or a trend line.",
  input: {
    kind: z.enum(["horizontal", "trend"]).describe("Drawing kind."),
    price: z.number().optional().describe("For a horizontal line: pin it to this exact price (defaults to last close)."),
  },
  handler: async (ctx, args) => {
    const r = await ctx.tv.addDrawing(args.kind, { price: args.price });
    return {
      text: r.placed ? `Placed ${r.kind} drawing (via ${r.method}).` : `Could not place ${r.kind} drawing.`,
      data: r,
    };
  },
});

export const removeAllDrawings = defineTool({
  name: "remove_all_drawings",
  description: "Remove every drawing (lines, shapes) from the active chart.",
  input: {},
  handler: async (ctx) => {
    const r = await ctx.tv.removeAllDrawings();
    return { text: r.ok ? `Removed ${r.removed} drawing(s).` : `Could not remove drawings${r.reason ? ` (${r.reason})` : ""}.`, data: r };
  },
});

export const listDrawings = defineTool({
  name: "list_drawings",
  description: "List the drawings currently on the active chart (id + type).",
  input: {},
  handler: async (ctx) => {
    const r = await ctx.tv.listDrawings();
    return { text: r.ok ? `${r.shapes.length} drawing(s).` : "Could not list drawings.", data: r };
  },
});

export const markupTools = [addIndicator, setChartType, setLayout, createAlert, replay, addDrawing, removeAllDrawings, listDrawings];
