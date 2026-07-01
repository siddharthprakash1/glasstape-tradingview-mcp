import { z } from "zod";
import { defineTool } from "../mcp/registry.js";
import { runBacktest, STRATEGIES } from "../backtest/index.js";

/** Strategy backtesting — OUR computation on top of TradingView's candle data. */

const STRATEGY_NAMES = Object.keys(STRATEGIES) as [string, ...string[]];

export const listStrategies = defineTool({
  name: "list_strategies",
  description: "List the built-in backtest strategies and their default parameters.",
  input: {},
  handler: async () => {
    const strategies = Object.values(STRATEGIES).map((s) => ({
      name: s.name,
      description: s.description,
      defaults: s.defaults,
    }));
    return { text: strategies.map((s) => `${s.name}: ${s.description}`).join("\n"), data: { strategies } };
  },
});

export const backtest = defineTool({
  name: "backtest",
  description:
    "Backtest a built-in strategy on the current chart's candles. Runs OUR own vectorized engine (fees + slippage, no look-ahead) and reports return vs buy-and-hold, max drawdown, Sharpe, win rate — PLUS in-sample vs out-of-sample metrics and an overfitting warning. Use list_strategies for names/params.",
  input: {
    strategy: z.enum(STRATEGY_NAMES).describe("Strategy name (see list_strategies)."),
    params: z.record(z.number()).optional().describe("Override strategy params, e.g. { fast: 10, slow: 30 }."),
    count: z.number().int().min(50).max(500).default(300).describe("How many recent candles to test on."),
    feeBps: z.number().min(0).max(100).optional().describe("Fee per side in basis points (default 5)."),
    slippageBps: z.number().min(0).max(100).optional().describe("Slippage per side in basis points (default 2)."),
  },
  handler: async (ctx, args) => {
    const data = await ctx.tv.getCandles(args.count);
    if (!data.ok || !data.candles || data.candles.length < 30) {
      return { text: `Could not read enough candles to backtest${data.reason ? ` (${data.reason})` : ""}.`, data };
    }
    const result = runBacktest(
      data.candles,
      args.strategy,
      args.params ?? {},
      { feeBps: args.feeBps, slippageBps: args.slippageBps },
    );
    const m = result.metrics;
    const summary =
      `${args.strategy} on ${data.symbol ?? "?"} @ ${data.resolution ?? "?"} (${result.bars} bars): ` +
      `return ${m.totalReturnPct}% vs buy&hold ${m.buyHoldReturnPct}%, maxDD ${m.maxDrawdownPct}%, ` +
      `Sharpe ${m.sharpe}, ${m.numTrades} trades, win ${m.winRatePct}%.` +
      (result.warning ? `\n⚠️ ${result.warning}` : "");
    return { text: summary, data: { symbol: data.symbol, resolution: data.resolution, ...result } };
  },
});

export const backtestTools = [listStrategies, backtest];
