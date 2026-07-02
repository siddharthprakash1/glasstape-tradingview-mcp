import { z } from "zod";
import { defineTool } from "../mcp/registry.js";
import { runBacktest, STRATEGIES } from "../backtest/index.js";
import { sweep, walkForward } from "../backtest/analysis.js";
import { fetchCandles } from "../data/index.js";
import type { GlasstapeContext } from "../context.js";
import type { Candle } from "../backtest/types.js";

/** Strategy backtesting — OUR computation, on TradingView OR a standalone data feed. */

const STRATEGY_NAMES = Object.keys(STRATEGIES) as [string, ...string[]];

/** Resolve candles from either the live TradingView chart or a standalone source. */
async function resolveCandles(
  ctx: GlasstapeContext,
  source: "chart" | "binance",
  symbol: string | undefined,
  interval: string | undefined,
  count: number,
): Promise<{ candles: Candle[]; symbol: string; resolution: string }> {
  if (source === "binance") {
    const r = await fetchCandles("binance", symbol ?? "BTCUSDT", interval ?? "4h", count);
    return { candles: r.candles, symbol: `BINANCE:${r.symbol.toUpperCase()}`, resolution: r.interval };
  }
  const d = await ctx.tv.getCandles(count);
  if (!d.ok || !d.candles) throw new Error(`Could not read chart candles${d.reason ? ` (${d.reason})` : ""}.`);
  return { candles: d.candles, symbol: d.symbol ?? "?", resolution: d.resolution ?? "?" };
}

const sourceInput = {
  source: z.enum(["chart", "binance"]).default("chart").describe("Where to get candles: the live chart, or Binance (no TradingView needed)."),
  symbol: z.string().optional().describe("Symbol when source=binance, e.g. BTCUSDT (default BTCUSDT)."),
  interval: z.string().optional().describe("Interval when source=binance, e.g. 4h, 1d (default 4h)."),
  count: z.number().int().min(50).max(1000).default(300).describe("How many candles."),
  feeBps: z.number().min(0).max(100).optional(),
  slippageBps: z.number().min(0).max(100).optional(),
};

export const listStrategies = defineTool({
  name: "list_strategies",
  description: "List the built-in backtest strategies and their default parameters.",
  input: {},
  handler: async () => {
    const strategies = Object.values(STRATEGIES).map((s) => ({ name: s.name, description: s.description, defaults: s.defaults }));
    return { text: strategies.map((s) => `${s.name}: ${s.description}`).join("\n"), data: { strategies } };
  },
});

export const backtest = defineTool({
  name: "backtest",
  description:
    "Backtest a built-in strategy on candles from the live chart OR from Binance (standalone, no TradingView). Runs OUR vectorized engine (fees + slippage, no look-ahead) and reports return vs buy-and-hold, drawdown, Sharpe/Sortino/Calmar, win rate — PLUS in-sample vs out-of-sample metrics and an overfitting warning.",
  input: { strategy: z.enum(STRATEGY_NAMES), params: z.record(z.number()).optional(), ...sourceInput },
  handler: async (ctx, args) => {
    const { candles, symbol, resolution } = await resolveCandles(ctx, args.source, args.symbol, args.interval, args.count);
    if (candles.length < 30) return { text: "Not enough candles to backtest.", data: { candles: candles.length } };
    const result = runBacktest(candles, args.strategy, args.params ?? {}, { feeBps: args.feeBps, slippageBps: args.slippageBps });
    const m = result.metrics;
    const summary =
      `${args.strategy} on ${symbol} @ ${resolution} (${result.bars} bars): ` +
      `return ${m.totalReturnPct}% vs buy&hold ${m.buyHoldReturnPct}%, maxDD ${m.maxDrawdownPct}%, ` +
      `Sharpe ${m.sharpe} / Sortino ${m.sortino}, ${m.numTrades} trades, win ${m.winRatePct}%.` +
      (result.warning ? `\n⚠️ ${result.warning}` : "");
    return { text: summary, data: { symbol, resolution, ...result } };
  },
});

export const walkForwardTool = defineTool({
  name: "walk_forward",
  description:
    "Walk-forward analysis: split the data into consecutive folds and test the strategy on each. Reveals strategies that only worked in one lucky period. Reports per-fold metrics, consistency, and a robustness verdict.",
  input: { strategy: z.enum(STRATEGY_NAMES), params: z.record(z.number()).optional(), folds: z.number().int().min(2).max(10).default(4), ...sourceInput },
  handler: async (ctx, args) => {
    const { candles, symbol, resolution } = await resolveCandles(ctx, args.source, args.symbol, args.interval, args.count);
    const wf = walkForward(candles, args.strategy, args.params ?? {}, { feeBps: args.feeBps, slippageBps: args.slippageBps }, args.folds);
    return {
      text: `${args.strategy} on ${symbol} @ ${resolution}: ${wf.folds.length} folds, avg return ${wf.avgReturnPct}%, ${Math.round(wf.consistency * 100)}% profitable. ${wf.verdict}`,
      data: { symbol, resolution, ...wf },
    };
  },
});

export const sweepTool = defineTool({
  name: "sweep_parameters",
  description:
    "Grid-search a strategy's parameters over ranges and rank the combinations by Sharpe. Useful for exploration — but remember, the best in-sample params are the easiest to overfit (validate the winner with walk_forward).",
  input: { strategy: z.enum(STRATEGY_NAMES), grid: z.record(z.array(z.number())).describe("Param → values to try, e.g. { fast: [5,10,20], slow: [30,50] }."), ...sourceInput },
  handler: async (ctx, args) => {
    const { candles, symbol, resolution } = await resolveCandles(ctx, args.source, args.symbol, args.interval, args.count);
    const ranked = sweep(candles, args.strategy, args.grid, { feeBps: args.feeBps, slippageBps: args.slippageBps });
    const top = ranked.slice(0, 10);
    const best = top[0];
    return {
      text: best
        ? `Best of ${ranked.length}: ${JSON.stringify(best.params)} → Sharpe ${best.sharpe}, return ${best.returnPct}%.`
        : "No combinations.",
      data: { symbol, resolution, tested: ranked.length, top },
    };
  },
});

export const backtestTools = [listStrategies, backtest, walkForwardTool, sweepTool];
