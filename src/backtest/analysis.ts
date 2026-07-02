import { runEngine } from "./engine.js";
import { STRATEGIES } from "./strategies.js";
import type { BacktestConfig, Candle, Metrics } from "./types.js";

/** One out-of-sample fold in a walk-forward run. */
export interface Fold {
  fold: number;
  fromTime: number;
  toTime: number;
  bars: number;
  metrics: Metrics;
}

export interface WalkForwardResult {
  strategy: string;
  params: Record<string, number>;
  folds: Fold[];
  /** Mean out-of-sample return and Sharpe across folds. */
  avgReturnPct: number;
  avgSharpe: number;
  /** Fraction of folds that were profitable, 0..1. */
  consistency: number;
  verdict: string;
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (x: number, dp = 2): number => Math.round(x * 10 ** dp) / 10 ** dp;

/**
 * Walk-forward analysis: slice the candles into `folds` consecutive windows and
 * evaluate the strategy on each. A strategy that only works on one slice of
 * history reveals itself here — the honest robustness test.
 */
export function walkForward(
  candles: Candle[],
  strategyName: string,
  params: Record<string, number> = {},
  config: BacktestConfig = {},
  folds = 4,
): WalkForwardResult {
  const strat = STRATEGIES[strategyName];
  if (!strat) throw new Error(`Unknown strategy '${strategyName}'.`);
  if (candles.length < folds * 20) {
    throw new Error(`Need at least ${folds * 20} candles for ${folds} folds (got ${candles.length}).`);
  }
  const merged = { ...strat.defaults, ...params };
  const positions = strat.run(candles, merged);

  const size = Math.floor(candles.length / folds);
  const results: Fold[] = [];
  for (let f = 0; f < folds; f++) {
    const start = f * size;
    const end = f === folds - 1 ? candles.length : start + size;
    const seg = candles.slice(start, end);
    const segPos = positions.slice(start, end);
    const r = runEngine(seg, segPos, config);
    results.push({
      fold: f + 1,
      fromTime: seg[0]!.time,
      toTime: seg[seg.length - 1]!.time,
      bars: seg.length,
      metrics: r.metrics,
    });
  }

  const returns = results.map((r) => r.metrics.totalReturnPct);
  const sharpes = results.map((r) => r.metrics.sharpe);
  const profitable = results.filter((r) => r.metrics.totalReturnPct > 0).length;
  const consistency = profitable / results.length;

  let verdict: string;
  if (consistency >= 0.75 && mean(returns) > 0) verdict = "Robust — profitable across most time windows.";
  else if (consistency >= 0.5) verdict = "Mixed — works in some periods, not others. Be cautious.";
  else verdict = "Fragile — fails in most windows. Likely curve-fit to a lucky period.";

  return {
    strategy: strategyName,
    params: merged,
    folds: results,
    avgReturnPct: round(mean(returns)),
    avgSharpe: round(mean(sharpes)),
    consistency: round(consistency, 2),
    verdict,
  };
}

export interface SweepEntry {
  params: Record<string, number>;
  returnPct: number;
  sharpe: number;
  maxDrawdownPct: number;
  numTrades: number;
}

/**
 * Grid-search a strategy's parameters. Returns entries ranked by Sharpe.
 * `grid` maps a param name to the values to try; the cartesian product is run.
 */
export function sweep(
  candles: Candle[],
  strategyName: string,
  grid: Record<string, number[]>,
  config: BacktestConfig = {},
): SweepEntry[] {
  const strat = STRATEGIES[strategyName];
  if (!strat) throw new Error(`Unknown strategy '${strategyName}'.`);

  const keys = Object.keys(grid);
  const combos: Array<Record<string, number>> = [{}];
  for (const key of keys) {
    const values = grid[key]!;
    const next: Array<Record<string, number>> = [];
    for (const base of combos) for (const v of values) next.push({ ...base, [key]: v });
    combos.splice(0, combos.length, ...next);
  }
  if (combos.length > 500) throw new Error(`Grid too large (${combos.length} combos); cap at 500.`);

  const entries: SweepEntry[] = combos.map((params) => {
    const merged = { ...strat.defaults, ...params };
    const positions = strat.run(candles, merged);
    const m = runEngine(candles, positions, config).metrics;
    return {
      params: merged,
      returnPct: m.totalReturnPct,
      sharpe: m.sharpe,
      maxDrawdownPct: m.maxDrawdownPct,
      numTrades: m.numTrades,
    };
  });

  return entries.sort((a, b) => b.sharpe - a.sharpe);
}
