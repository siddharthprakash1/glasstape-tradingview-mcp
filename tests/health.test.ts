import { describe, expect, it } from "vitest";
import type { GlasstapeContext } from "../src/context.js";
import { runHealthCheck } from "../src/health/check.js";
import { GlasstapeError } from "../src/util/errors.js";

function fakeCtx(parts: {
  connect?: () => Promise<void>;
  isTradingView?: () => Promise<boolean>;
  selfTest?: () => Promise<Record<string, { ok: boolean; strategyIndex: number | null }>>;
  version?: unknown;
  targetInfo?: { title: string; url: string };
}): GlasstapeContext {
  return {
    cfg: { host: "127.0.0.1", port: 9222, targetMatchers: [], evalTimeoutMs: 1000 },
    cdp: {
      connect: parts.connect ?? (async () => {}),
      evaluate: async () => parts.version ?? null,
      targetInfo: parts.targetInfo,
      close: async () => {},
    },
    tv: {
      isTradingView: parts.isTradingView ?? (async () => true),
      selfTest: parts.selfTest ?? (async () => ({})),
    },
  } as unknown as GlasstapeContext;
}

describe("runHealthCheck", () => {
  it("reports healthy when everything resolves", async () => {
    const ctx = fakeCtx({
      isTradingView: async () => true,
      version: "2.14",
      targetInfo: { title: "BTCUSD", url: "https://www.tradingview.com" },
      selfTest: async () => ({
        chartCanvas: { ok: true, strategyIndex: 0 },
        legendTitle: { ok: true, strategyIndex: 1 },
      }),
    });
    const r = await runHealthCheck(ctx);
    expect(r.ok).toBe(true);
    expect(r.cdp.connected).toBe(true);
    expect(r.version).toBe("2.14");
    expect(r.selectorsOk).toBe(2);
    expect(r.selectorsTotal).toBe(2);
    expect(r.issues).toHaveLength(0);
  });

  it("never throws, and captures the connect failure as an issue", async () => {
    const ctx = fakeCtx({
      connect: async () => {
        throw new GlasstapeError("CDP_CONNECT_FAILED", "no CDP", { hint: "launch TradingView" });
      },
    });
    const r = await runHealthCheck(ctx);
    expect(r.ok).toBe(false);
    expect(r.cdp.connected).toBe(false);
    expect(r.issues.join(" ")).toContain("no CDP");
    expect(r.issues.join(" ")).toContain("launch TradingView");
  });

  it("is not ok and names the broken required selector", async () => {
    const ctx = fakeCtx({
      isTradingView: async () => true,
      selfTest: async () => ({
        chartCanvas: { ok: true, strategyIndex: 0 },
        symbolSearchButton: { ok: false, strategyIndex: null },
      }),
    });
    const r = await runHealthCheck(ctx);
    expect(r.ok).toBe(false);
    expect(r.selectorsOk).toBe(1);
    expect(r.selectorsTotal).toBe(2);
    expect(r.issues.join(" ")).toContain("symbolSearchButton");
  });

  it("stays healthy when only an OPTIONAL (Phase-2) selector is missing", async () => {
    const ctx = fakeCtx({
      isTradingView: async () => true,
      selfTest: async () => ({
        chartCanvas: { ok: true, strategyIndex: 0 }, // required
        replayButton: { ok: false, strategyIndex: null }, // optional → must not degrade
      }),
    });
    const r = await runHealthCheck(ctx);
    expect(r.ok).toBe(true);
    expect(r.selectorsTotal).toBe(1); // optional excluded from the count
    expect(r.selectorsOk).toBe(1);
    expect(r.issues).toHaveLength(0);
  });
});
