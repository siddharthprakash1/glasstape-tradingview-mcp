/** Backtesting types. This module is PURE — no TradingView/CDP dependency — so
 *  it's fully unit-testable and the computation is genuinely ours. */

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestConfig {
  /** Starting capital. Default 10000. */
  initialCapital?: number;
  /** Fee per side in basis points (1 bp = 0.01%). Default 5. */
  feeBps?: number;
  /** Slippage per side in basis points. Default 2. */
  slippageBps?: number;
}

/** A closed long trade. */
export interface Trade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  bars: number;
}

export interface Metrics {
  finalEquity: number;
  totalReturnPct: number;
  buyHoldReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  numTrades: number;
  winRatePct: number;
  profitFactor: number;
  avgTradePct: number;
  exposurePct: number;
}

export interface EngineResult {
  metrics: Metrics;
  trades: Trade[];
  equityCurve: number[];
}
