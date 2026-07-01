import type { BacktestConfig, Candle, EngineResult, Metrics, Trade } from "./types.js";

const SECONDS_PER_YEAR = 365 * 24 * 3600;

/** Median spacing between candles, in seconds (used to annualise). */
function medianBarSeconds(candles: Candle[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < candles.length; i++) deltas.push(candles[i]!.time - candles[i - 1]!.time);
  if (!deltas.length) return 86400;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const m = deltas[mid]!;
  return m > 0 ? m : 86400;
}

/**
 * Simulate a long-only strategy from a target-position series (0 = flat, 1 = long).
 *
 * No look-ahead: `positions[i]` is the target decided at bar i's close, and it
 * only affects bar i+1's return. Fees + slippage are charged on every position
 * change. The equity curve is the source of truth; discrete `trades` are tracked
 * for win-rate / profit-factor stats.
 */
export function runEngine(
  candles: Candle[],
  positions: number[],
  config: BacktestConfig = {},
): EngineResult {
  const initial = config.initialCapital ?? 10000;
  const fee = (config.feeBps ?? 5) / 10000;
  const slip = (config.slippageBps ?? 2) / 10000;
  const n = candles.length;

  const equityCurve: number[] = new Array(n).fill(initial);
  const trades: Trade[] = [];
  const barRets: number[] = [];
  let equity = initial;
  let barsInMarket = 0;
  let entry: { price: number; time: number; index: number } | null = null;

  for (let i = 1; i < n; i++) {
    const exposure = positions[i - 1] ?? 0; // decided at close[i-1], active over bar i
    const prevExposure = positions[i - 2] ?? 0; // to detect a change at the start of bar i
    const barRet = candles[i]!.close / candles[i - 1]!.close - 1;
    const turnover = Math.abs(exposure - prevExposure);
    const cost = turnover * (fee + slip);
    const stratRet = exposure * barRet - cost;

    equity *= 1 + stratRet;
    equityCurve[i] = equity;
    barRets.push(stratRet);
    if (exposure === 1) barsInMarket++;

    // Discrete trades: position turned on/off at the close of bar i-1.
    if (prevExposure === 0 && exposure === 1) {
      entry = { price: candles[i - 1]!.close * (1 + slip), time: candles[i - 1]!.time, index: i - 1 };
    } else if (prevExposure === 1 && exposure === 0 && entry) {
      const exitPrice = candles[i - 1]!.close * (1 - slip);
      trades.push({
        entryTime: entry.time,
        exitTime: candles[i - 1]!.time,
        entryPrice: entry.price,
        exitPrice,
        returnPct: (exitPrice / entry.price - 1 - 2 * fee) * 100,
        bars: i - 1 - entry.index,
      });
      entry = null;
    }
  }

  // Close any trade still open at the last bar.
  if (entry && n > 0) {
    const last = candles[n - 1]!;
    const exitPrice = last.close * (1 - slip);
    trades.push({
      entryTime: entry.time,
      exitTime: last.time,
      entryPrice: entry.price,
      exitPrice,
      returnPct: (exitPrice / entry.price - 1 - 2 * fee) * 100,
      bars: n - 1 - entry.index,
    });
  }

  return { metrics: computeMetrics(candles, equityCurve, barRets, trades, initial, barsInMarket), trades, equityCurve };
}

function computeMetrics(
  candles: Candle[],
  equityCurve: number[],
  barRets: number[],
  trades: Trade[],
  initial: number,
  barsInMarket: number,
): Metrics {
  const n = candles.length;
  const finalEquity = equityCurve[n - 1] ?? initial;
  const totalReturnPct = (finalEquity / initial - 1) * 100;
  const buyHoldReturnPct =
    n >= 2 ? (candles[n - 1]!.close / candles[0]!.close - 1) * 100 : 0;

  // Max drawdown.
  let peak = equityCurve[0] ?? initial;
  let maxDd = 0;
  for (const e of equityCurve) {
    if (e > peak) peak = e;
    const dd = peak > 0 ? (peak - e) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  // Sharpe (annualised) from per-bar strategy returns.
  const barSeconds = medianBarSeconds(candles);
  const barsPerYear = SECONDS_PER_YEAR / barSeconds;
  const mean = barRets.reduce((a, b) => a + b, 0) / (barRets.length || 1);
  const variance = barRets.reduce((a, b) => a + (b - mean) ** 2, 0) / (barRets.length || 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(barsPerYear) : 0;

  // CAGR.
  const spanSeconds = n >= 2 ? candles[n - 1]!.time - candles[0]!.time : 0;
  const years = spanSeconds / SECONDS_PER_YEAR;
  const cagrPct =
    years > 0 && finalEquity > 0 ? ((finalEquity / initial) ** (1 / years) - 1) * 100 : 0;

  // Trade stats.
  const wins = trades.filter((t) => t.returnPct > 0);
  const grossProfit = wins.reduce((a, t) => a + t.returnPct, 0);
  const grossLoss = trades.filter((t) => t.returnPct <= 0).reduce((a, t) => a - t.returnPct, 0);
  const winRatePct = trades.length ? (wins.length / trades.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const avgTradePct = trades.length
    ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length
    : 0;
  const exposurePct = n > 1 ? (barsInMarket / (n - 1)) * 100 : 0;

  return {
    finalEquity: round(finalEquity, 2),
    totalReturnPct: round(totalReturnPct, 2),
    buyHoldReturnPct: round(buyHoldReturnPct, 2),
    cagrPct: round(cagrPct, 2),
    maxDrawdownPct: round(maxDd * 100, 2),
    sharpe: round(sharpe, 2),
    numTrades: trades.length,
    winRatePct: round(winRatePct, 1),
    profitFactor: Number.isFinite(profitFactor) ? round(profitFactor, 2) : profitFactor,
    avgTradePct: round(avgTradePct, 2),
    exposurePct: round(exposurePct, 1),
  };
}

function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
