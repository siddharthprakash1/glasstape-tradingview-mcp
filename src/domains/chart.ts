import { z } from "zod";
import { defineTool } from "../mcp/registry.js";

/** Chart reading and navigation tools. */

export const getChartState = defineTool({
  name: "get_chart_state",
  description:
    "Read the current chart: symbol, timeframe, document title and URL. Use this to know what is on screen before acting.",
  input: {},
  handler: async (ctx) => {
    const state = await ctx.tv.getState();
    return {
      text: `Symbol: ${state.symbol ?? "?"} · Timeframe: ${state.timeframe ?? "?"}`,
      data: state,
    };
  },
});

export const setSymbol = defineTool({
  name: "set_symbol",
  description:
    "Switch the chart to a different symbol via the symbol search (e.g. 'BTCUSD', 'NASDAQ:AAPL', 'EURUSD'). Returns the resulting chart state.",
  input: {
    symbol: z.string().min(1).describe("Ticker to switch to, optionally exchange-qualified."),
  },
  handler: async (ctx, args) => {
    const result = await ctx.tv.setSymbol(args.symbol);
    return {
      text: `Requested ${result.requested}. Legend now shows: ${result.state.symbol ?? "?"}.`,
      data: result,
    };
  },
});

export const setTimeframe = defineTool({
  name: "set_timeframe",
  description:
    "Change the chart timeframe/interval. Accepts codes like '1','5','15','60','240','1H','4H','D','W','1mo'.",
  input: {
    timeframe: z.string().min(1).describe("Interval code, e.g. 240 or 4H or D."),
  },
  handler: async (ctx, args) => {
    const result = await ctx.tv.setTimeframe(args.timeframe);
    return {
      text: result.matched
        ? `Switched to ${result.requested}. Interval control now: ${result.state.timeframe ?? "?"}.`
        : `Could not find a menu row matching '${result.requested}'. The interval menu was opened but no label matched.`,
      data: result,
    };
  },
});

export const getLegend = defineTool({
  name: "get_legend",
  description:
    "Read the chart legend value rows (OHLC and any indicator values currently displayed) as text lines.",
  input: {},
  handler: async (ctx) => {
    const lines = await ctx.tv.getLegend();
    return {
      text: lines.length ? lines.map((l) => `• ${l.text}`).join("\n") : "Legend is empty or not found.",
      data: lines,
    };
  },
});

export const focusChart = defineTool({
  name: "focus_chart",
  description: "Give keyboard focus to the chart surface (useful before keyboard-driven actions).",
  input: {},
  handler: async (ctx) => {
    await ctx.tv.focusChart();
    return { text: "Chart focused." };
  },
});

export const getCandles = defineTool({
  name: "get_candles",
  description:
    "Read recent OHLCV candles from the chart as real structured data (time, open, high, low, close, volume) — not scraped from the legend. Use for analysis, backtesting inputs, or summaries.",
  input: {
    count: z.number().int().min(1).max(500).default(50).describe("How many most-recent candles to return."),
  },
  handler: async (ctx, args) => {
    const r = await ctx.tv.getCandles(args.count);
    if (!r.ok) return { text: `Could not read candles${r.reason ? ` (${r.reason})` : ""}.`, data: r };
    const last = r.candles && r.candles.length ? r.candles[r.candles.length - 1] : undefined;
    return {
      text: `${r.candles?.length ?? 0} candles for ${r.symbol ?? "?"} @ ${r.resolution ?? "?"}${last ? ` · last close ${last.close}` : ""}.`,
      data: r,
    };
  },
});

export const chartTools = [getChartState, setSymbol, setTimeframe, getLegend, getCandles, focusChart];
