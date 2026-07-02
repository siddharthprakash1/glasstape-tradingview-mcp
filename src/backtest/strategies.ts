import { bollinger, ema, highest, lowest, macd as macdIndicator, roc, rsi, sma } from "./indicators.js";
import type { Candle } from "./types.js";

/** A strategy turns candles + params into a target-position series (0 flat, 1 long). */
export interface StrategyDef {
  name: string;
  description: string;
  defaults: Record<string, number>;
  run(candles: Candle[], params: Record<string, number>): number[];
}

const closes = (candles: Candle[]): number[] => candles.map((c) => c.close);

export const STRATEGIES: Record<string, StrategyDef> = {
  sma_crossover: {
    name: "sma_crossover",
    description: "Long while the fast SMA is above the slow SMA; flat otherwise.",
    defaults: { fast: 20, slow: 50 },
    run(candles, p) {
      const c = closes(candles);
      const fast = sma(c, Math.round(p.fast ?? 20));
      const slow = sma(c, Math.round(p.slow ?? 50));
      return c.map((_, i) => {
        const f = fast[i];
        const s = slow[i];
        return f !== undefined && s !== undefined && f > s ? 1 : 0;
      });
    },
  },

  rsi_reversion: {
    name: "rsi_reversion",
    description: "Enter long when RSI drops below `oversold`; exit when it rises above `overbought`.",
    defaults: { period: 14, oversold: 30, overbought: 55 },
    run(candles, p) {
      const period = Math.round(p.period ?? 14);
      const oversold = p.oversold ?? 30;
      const overbought = p.overbought ?? 55;
      const r = rsi(closes(candles), period);
      const pos: number[] = new Array(candles.length).fill(0);
      let holding = false;
      for (let i = 0; i < candles.length; i++) {
        const v = r[i];
        if (v !== undefined) {
          if (!holding && v < oversold) holding = true;
          else if (holding && v > overbought) holding = false;
        }
        pos[i] = holding ? 1 : 0;
      }
      return pos;
    },
  },

  breakout: {
    name: "breakout",
    description: "Long on a close above the prior `lookback`-bar high; exit on a close below the prior `lookback`-bar low.",
    defaults: { lookback: 20 },
    run(candles, p) {
      const lookback = Math.round(p.lookback ?? 20);
      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);
      // Trailing extremes EXCLUDING the current bar (shift by one) to avoid look-ahead.
      const hh = highest(highs, lookback);
      const ll = lowest(lows, lookback);
      const pos: number[] = new Array(candles.length).fill(0);
      let holding = false;
      for (let i = 1; i < candles.length; i++) {
        const priorHigh = hh[i - 1];
        const priorLow = ll[i - 1];
        const close = candles[i]!.close;
        if (!holding && priorHigh !== undefined && close > priorHigh) holding = true;
        else if (holding && priorLow !== undefined && close < priorLow) holding = false;
        pos[i] = holding ? 1 : 0;
      }
      return pos;
    },
  },

  ema_crossover: {
    name: "ema_crossover",
    description: "Long while the fast EMA is above the slow EMA (more responsive than SMA).",
    defaults: { fast: 12, slow: 26 },
    run(candles, p) {
      const c = closes(candles);
      const fast = ema(c, Math.round(p.fast ?? 12));
      const slow = ema(c, Math.round(p.slow ?? 26));
      return c.map((_, i) => {
        const f = fast[i];
        const s = slow[i];
        return f !== undefined && s !== undefined && f > s ? 1 : 0;
      });
    },
  },

  macd: {
    name: "macd",
    description: "Long while the MACD line is above its signal line (trend/momentum).",
    defaults: { fast: 12, slow: 26, signal: 9 },
    run(candles, p) {
      const m = macdIndicator(closes(candles), Math.round(p.fast ?? 12), Math.round(p.slow ?? 26), Math.round(p.signal ?? 9));
      return candles.map((_, i) => {
        const line = m.macd[i];
        const sig = m.signal[i];
        return line !== undefined && sig !== undefined && line > sig ? 1 : 0;
      });
    },
  },

  bollinger: {
    name: "bollinger",
    description: "Mean reversion: buy a close below the lower band, exit at the middle band.",
    defaults: { period: 20, mult: 2 },
    run(candles, p) {
      const c = closes(candles);
      const b = bollinger(c, Math.round(p.period ?? 20), p.mult ?? 2);
      const pos: number[] = new Array(candles.length).fill(0);
      let holding = false;
      for (let i = 0; i < candles.length; i++) {
        const lower = b.lower[i];
        const mid = b.middle[i];
        if (lower !== undefined && mid !== undefined) {
          if (!holding && c[i]! < lower) holding = true;
          else if (holding && c[i]! > mid) holding = false;
        }
        pos[i] = holding ? 1 : 0;
      }
      return pos;
    },
  },

  momentum: {
    name: "momentum",
    description: "Long while the N-bar rate of change is above a threshold (%).",
    defaults: { period: 20, threshold: 0 },
    run(candles, p) {
      const r = roc(closes(candles), Math.round(p.period ?? 20));
      const threshold = p.threshold ?? 0;
      return candles.map((_, i) => (r[i] !== undefined && r[i]! > threshold ? 1 : 0));
    },
  },
};

export type StrategyName = keyof typeof STRATEGIES;
