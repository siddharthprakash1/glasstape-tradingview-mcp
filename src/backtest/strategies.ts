import { highest, lowest, rsi, sma } from "./indicators.js";
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
};

export type StrategyName = keyof typeof STRATEGIES;
