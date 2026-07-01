import { describe, expect, it } from "vitest";
import { ema, highest, lowest, rsi, sma } from "../src/backtest/indicators.js";
import { runEngine } from "../src/backtest/engine.js";
import { STRATEGIES } from "../src/backtest/strategies.js";
import { runBacktest } from "../src/backtest/index.js";
import type { Candle } from "../src/backtest/types.js";

/** Build candles from a close series (open=prevClose, simple high/low). */
function mk(closesArr: number[], stepSec = 3600): Candle[] {
  return closesArr.map((c, i) => ({
    time: 1_700_000_000 + i * stepSec,
    open: i === 0 ? c : closesArr[i - 1]!,
    high: Math.max(c, i === 0 ? c : closesArr[i - 1]!) * 1.001,
    low: Math.min(c, i === 0 ? c : closesArr[i - 1]!) * 0.999,
    close: c,
    volume: 1,
  }));
}

describe("indicators", () => {
  it("sma matches a hand calculation", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([undefined, undefined, 2, 3, 4]);
  });
  it("ema is seeded from sma and stays within range", () => {
    const e = ema([1, 2, 3, 4, 5, 6], 3);
    expect(e[0]).toBeUndefined();
    expect(e[2]).toBeCloseTo(2, 5); // sma seed
    expect(e[5]!).toBeGreaterThan(e[2]!);
  });
  it("rsi is 100 for a monotonically rising series and warms up", () => {
    const r = rsi([1, 2, 3, 4, 5, 6, 7, 8], 3);
    expect(r[2]).toBeUndefined();
    expect(r[3]).toBe(100);
    expect(r[7]).toBe(100);
  });
  it("rsi is 0 for a monotonically falling series", () => {
    const r = rsi([8, 7, 6, 5, 4, 3], 3);
    expect(r[3]).toBe(0);
  });
  it("highest/lowest roll correctly", () => {
    expect(highest([1, 3, 2, 5, 4], 2)).toEqual([undefined, 3, 3, 5, 5]);
    expect(lowest([5, 3, 4, 1, 2], 2)).toEqual([undefined, 3, 3, 1, 1]);
  });
});

describe("engine", () => {
  it("flat positions leave equity unchanged", () => {
    const c = mk([100, 110, 120, 130]);
    const r = runEngine(c, [0, 0, 0, 0], { initialCapital: 10000 });
    expect(r.metrics.totalReturnPct).toBe(0);
    expect(r.metrics.numTrades).toBe(0);
    expect(r.metrics.finalEquity).toBe(10000);
  });

  it("always-long with zero costs equals buy & hold", () => {
    const c = mk([100, 110, 121, 133.1]); // +10% each bar
    const r = runEngine(c, [1, 1, 1, 1], { initialCapital: 1000, feeBps: 0, slippageBps: 0 });
    expect(r.metrics.totalReturnPct).toBeCloseTo(r.metrics.buyHoldReturnPct, 4);
    expect(r.metrics.totalReturnPct).toBeCloseTo(33.1, 1);
  });

  it("costs make it underperform buy & hold", () => {
    const c = mk([100, 110, 121, 133.1]);
    const r = runEngine(c, [1, 1, 1, 1], { feeBps: 50, slippageBps: 50 });
    expect(r.metrics.totalReturnPct).toBeLessThan(r.metrics.buyHoldReturnPct);
  });

  it("does not look ahead: a position decided before a move captures it", () => {
    // close jumps +10% into bar 2; a position set at bar 1's close captures it.
    const c = mk([100, 100, 110, 110]);
    const r = runEngine(c, [0, 1, 0, 0], { feeBps: 0, slippageBps: 0 });
    expect(r.metrics.totalReturnPct).toBeCloseTo(10, 1);
    expect(r.metrics.numTrades).toBe(1);
  });

  it("records a winning trade", () => {
    const c = mk([100, 100, 110, 120, 120]);
    const r = runEngine(c, [0, 1, 1, 0, 0], { feeBps: 0, slippageBps: 0 });
    expect(r.metrics.numTrades).toBe(1);
    expect(r.trades[0]!.returnPct).toBeGreaterThan(0);
    expect(r.metrics.winRatePct).toBe(100);
  });
});

describe("strategies", () => {
  it("all produce 0/1 series of the right length", () => {
    const c = mk(Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 10));
    for (const name of Object.keys(STRATEGIES)) {
      const pos = STRATEGIES[name]!.run(c, {});
      expect(pos.length).toBe(c.length);
      expect(pos.every((p) => p === 0 || p === 1)).toBe(true);
    }
  });
  it("sma_crossover is long on a steadily rising series and flat on a falling one", () => {
    const up = mk(Array.from({ length: 60 }, (_, i) => 100 + i));
    const down = mk(Array.from({ length: 60 }, (_, i) => 160 - i));
    expect(STRATEGIES.sma_crossover!.run(up, {}).at(-1)).toBe(1);
    expect(STRATEGIES.sma_crossover!.run(down, {}).at(-1)).toBe(0);
  });
});

describe("runBacktest", () => {
  const series = mk(Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 6) * 15 + i * 0.2));

  it("returns full + in-sample + out-of-sample metrics", () => {
    const r = runBacktest(series, "sma_crossover", {}, { feeBps: 5, slippageBps: 2 });
    expect(r.strategy).toBe("sma_crossover");
    expect(r.metrics).toBeDefined();
    expect(r.inSample).toBeDefined();
    expect(r.outOfSample).toBeDefined();
    expect(r.params.fast).toBe(20);
  });

  it("throws on an unknown strategy", () => {
    expect(() => runBacktest(series, "nope")).toThrow(/Unknown strategy/);
  });

  it("throws when there aren't enough candles", () => {
    expect(() => runBacktest(mk([1, 2, 3]), "sma_crossover")).toThrow(/at least 30/);
  });

  it("honours custom params", () => {
    const r = runBacktest(series, "sma_crossover", { fast: 5, slow: 10 });
    expect(r.params.fast).toBe(5);
    expect(r.params.slow).toBe(10);
  });
});
