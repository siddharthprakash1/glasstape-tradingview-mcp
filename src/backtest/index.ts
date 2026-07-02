import { runEngine } from "./engine.js";
import { STRATEGIES } from "./strategies.js";
import type { BacktestConfig, Candle, Metrics, Trade } from "./types.js";

export { STRATEGIES } from "./strategies.js";
export type { Candle, BacktestConfig, Metrics, Trade } from "./types.js";

export interface BacktestResult {
  strategy: string;
  params: Record<string, number>;
  bars: number;
  metrics: Metrics;
  trades: Trade[];
  inSample: Metrics;
  outOfSample: Metrics;
  /** Equity curve (one point per bar) for charting. */
  equityCurve: number[];
  /** Non-null when the split suggests the result may be overfit. */
  warning: string | null;
}

/**
 * Run a built-in strategy over candles, with an in-sample / out-of-sample split
 * to flag overfitting — the guardrail that in-chart backtesting can't give you.
 */
export function runBacktest(
  candles: Candle[],
  strategyName: string,
  params: Record<string, number> = {},
  config: BacktestConfig = {},
  oosFraction = 0.3,
): BacktestResult {
  const strat = STRATEGIES[strategyName];
  if (!strat) {
    throw new Error(`Unknown strategy '${strategyName}'. Available: ${Object.keys(STRATEGIES).join(", ")}`);
  }
  if (candles.length < 30) {
    throw new Error(`Need at least 30 candles to backtest (got ${candles.length}).`);
  }

  const merged = { ...strat.defaults, ...params };
  const positions = strat.run(candles, merged);
  const full = runEngine(candles, positions, config);

  const splitIdx = Math.max(15, Math.floor(candles.length * (1 - oosFraction)));
  const isResult = runEngine(candles.slice(0, splitIdx), positions.slice(0, splitIdx), config);
  const oosResult = runEngine(candles.slice(splitIdx), positions.slice(splitIdx), config);

  return {
    strategy: strategyName,
    params: merged,
    bars: candles.length,
    metrics: full.metrics,
    trades: full.trades,
    inSample: isResult.metrics,
    outOfSample: oosResult.metrics,
    equityCurve: full.equityCurve,
    warning: overfitWarning(isResult.metrics, oosResult.metrics),
  };
}

function overfitWarning(is: Metrics, oos: Metrics): string | null {
  if (is.totalReturnPct > 0 && oos.totalReturnPct <= 0) {
    return "Profitable in-sample but flat/negative out-of-sample — likely overfit. Don't trust it.";
  }
  if (is.sharpe > 0.5 && oos.sharpe < is.sharpe * 0.4) {
    return "Out-of-sample Sharpe is far below in-sample — the edge may not generalise.";
  }
  if (oos.numTrades < 3) {
    return "Very few out-of-sample trades — not enough evidence to judge robustness.";
  }
  if (is.totalReturnPct > 0 && oos.totalReturnPct > 0 && oos.totalReturnPct < is.totalReturnPct * 0.3) {
    return "Out-of-sample return is much weaker than in-sample — treat with caution.";
  }
  return null;
}
