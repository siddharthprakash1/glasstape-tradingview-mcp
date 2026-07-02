import { describe, expect, it } from "vitest";
import { bollinger, macd, roc, stddev } from "../src/backtest/indicators.js";
import { STRATEGIES } from "../src/backtest/strategies.js";
import { sweep, walkForward } from "../src/backtest/analysis.js";
import { parseBinanceKlines, toBinanceInterval } from "../src/data/binance.js";
import type { Candle } from "../src/backtest/types.js";

function mk(closesArr: number[], stepSec = 3600): Candle[] {
  return closesArr.map((c, i) => ({
    time: 1_700_000_000 + i * stepSec,
    open: i === 0 ? c : closesArr[i - 1]!,
    high: c * 1.001,
    low: c * 0.999,
    close: c,
    volume: 1,
  }));
}

describe("new indicators", () => {
  it("stddev is 0 for a flat series and positive for a varying one", () => {
    expect(stddev([5, 5, 5, 5], 3)[3]).toBeCloseTo(0, 6);
    expect(stddev([1, 2, 3, 4, 5], 3)[4]!).toBeGreaterThan(0);
  });
  it("bollinger bands straddle the middle", () => {
    const b = bollinger([1, 2, 3, 4, 5, 6, 7, 8], 4, 2);
    const i = 7;
    expect(b.upper[i]!).toBeGreaterThan(b.middle[i]!);
    expect(b.lower[i]!).toBeLessThan(b.middle[i]!);
  });
  it("macd line and signal are defined after warmup", () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5);
    const m = macd(values, 12, 26, 9);
    expect(m.macd[0]).toBeUndefined();
    expect(m.macd.at(-1)).toBeTypeOf("number");
    expect(m.signal.at(-1)).toBeTypeOf("number");
  });
  it("roc computes percentage change", () => {
    expect(roc([100, 110], 1)[1]).toBeCloseTo(10, 6);
  });
});

describe("new strategies", () => {
  it("all registered strategies produce valid 0/1 series", () => {
    const c = mk(Array.from({ length: 90 }, (_, i) => 100 + Math.sin(i / 5) * 12 + i * 0.1));
    for (const name of ["ema_crossover", "macd", "bollinger", "momentum"]) {
      const pos = STRATEGIES[name]!.run(c, {});
      expect(pos.length).toBe(c.length);
      expect(pos.every((p) => p === 0 || p === 1)).toBe(true);
    }
  });
  it("there are at least 6 strategies", () => {
    expect(Object.keys(STRATEGIES).length).toBeGreaterThanOrEqual(6);
  });
});

describe("walk-forward", () => {
  const series = mk(Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 8) * 15 + i * 0.1));
  it("returns per-fold metrics and a verdict", () => {
    const wf = walkForward(series, "sma_crossover", {}, {}, 4);
    expect(wf.folds).toHaveLength(4);
    expect(wf.consistency).toBeGreaterThanOrEqual(0);
    expect(wf.consistency).toBeLessThanOrEqual(1);
    expect(typeof wf.verdict).toBe("string");
  });
  it("throws when there isn't enough data", () => {
    expect(() => walkForward(mk([1, 2, 3, 4, 5]), "sma_crossover", {}, {}, 4)).toThrow();
  });
});

describe("parameter sweep", () => {
  const series = mk(Array.from({ length: 150 }, (_, i) => 100 + Math.sin(i / 6) * 10 + i * 0.15));
  it("returns entries ranked by Sharpe", () => {
    const r = sweep(series, "sma_crossover", { fast: [5, 10], slow: [20, 30] });
    expect(r).toHaveLength(4);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.sharpe).toBeGreaterThanOrEqual(r[i]!.sharpe);
  });
  it("rejects an oversized grid", () => {
    const big: Record<string, number[]> = { fast: Array.from({ length: 30 }, (_, i) => i + 1), slow: Array.from({ length: 30 }, (_, i) => i + 40) };
    expect(() => sweep(series, "sma_crossover", big)).toThrow(/Grid too large/);
  });
});

describe("binance data parsing", () => {
  it("parses klines into candles", () => {
    const raw = [[1700000000000, "100.5", "101", "99.5", "100.8", "12.3", 1700003599999, "x", 5]];
    const c = parseBinanceKlines(raw);
    expect(c[0]).toEqual({ time: 1700000000, open: 100.5, high: 101, low: 99.5, close: 100.8, volume: 12.3 });
  });
  it("normalises interval codes", () => {
    expect(toBinanceInterval("240")).toBe("4h");
    expect(toBinanceInterval("D")).toBe("1d");
    expect(toBinanceInterval("4h")).toBe("4h");
  });
  it("throws on a non-array", () => {
    expect(() => parseBinanceKlines({})).toThrow();
  });
});
