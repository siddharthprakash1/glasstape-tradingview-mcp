import { describe, expect, it } from "vitest";
import type { NamedKey, PageDriver, ScreenshotOptions, Viewport } from "../src/cdp/types.js";
import { TvAdapter } from "../src/tv/adapter.js";

interface Call {
  method: string;
  arg?: unknown;
}

/** A programmable PageDriver for testing the adapter without a browser. */
class FakePageDriver implements PageDriver {
  connected = true;
  calls: Call[] = [];
  onEvaluate: (expr: string) => unknown = () => null;

  async evaluate<T>(expression: string): Promise<T> {
    this.calls.push({ method: "evaluate", arg: expression });
    return this.onEvaluate(expression) as T;
  }
  async screenshot(_opts?: ScreenshotOptions): Promise<string> {
    this.calls.push({ method: "screenshot" });
    return "BASE64DATA";
  }
  async typeText(text: string): Promise<void> {
    this.calls.push({ method: "typeText", arg: text });
  }
  async pressKey(key: NamedKey): Promise<void> {
    this.calls.push({ method: "pressKey", arg: key });
  }
  async clickAt(x: number, y: number): Promise<void> {
    this.calls.push({ method: "clickAt", arg: { x, y } });
  }
  async viewport(): Promise<Viewport> {
    return { width: 1200, height: 800 };
  }
}

const instant = async () => {};

describe("TvAdapter.getState", () => {
  it("returns the value the page evaluation produces", async () => {
    const fake = new FakePageDriver();
    fake.onEvaluate = () => ({ symbol: "BTCUSD", timeframe: "4h", title: "BTCUSD", href: "http://x" });
    const adapter = new TvAdapter(fake, instant);
    const state = await adapter.getState();
    expect(state.symbol).toBe("BTCUSD");
    expect(state.timeframe).toBe("4h");
  });
});

describe("TvAdapter.setSymbol", () => {
  it("opens search, types the uppercased symbol, presses Enter, then re-reads state", async () => {
    const fake = new FakePageDriver();
    fake.onEvaluate = (expr) => {
      if (expr.includes("location.href")) {
        return { symbol: "ETHUSD", timeframe: "1D", title: "ETHUSD", href: "http://x" };
      }
      return true; // clickSelector / focusSelector succeed
    };
    const adapter = new TvAdapter(fake, instant);
    const result = await adapter.setSymbol("ethusd");

    expect(result.requested).toBe("ETHUSD");
    expect(result.state.symbol).toBe("ETHUSD");
    const typed = fake.calls.find((c) => c.method === "typeText");
    expect(typed?.arg).toBe("ETHUSD");
    expect(fake.calls.some((c) => c.method === "pressKey" && c.arg === "Enter")).toBe(true);
  });

  it("throws an actionable error when the search button is missing", async () => {
    const fake = new FakePageDriver();
    fake.onEvaluate = (expr) => (expr.includes("location.href") ? {} : false);
    const adapter = new TvAdapter(fake, instant);
    await expect(adapter.setSymbol("BTCUSD")).rejects.toMatchObject({ code: "SELECTOR_NOT_FOUND" });
  });

  it("rejects empty symbols", async () => {
    const adapter = new TvAdapter(new FakePageDriver(), instant);
    await expect(adapter.setSymbol("   ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("TvAdapter.setTimeframe", () => {
  it("reports matched=true when a menu row matches", async () => {
    const fake = new FakePageDriver();
    fake.onEvaluate = (expr) => {
      if (expr.includes("location.href")) return { symbol: "X", timeframe: "4h", title: "", href: "" };
      if (expr.includes('role="option"')) return true; // a row matched
      return true; // open interval button
    };
    const adapter = new TvAdapter(fake, instant);
    const r = await adapter.setTimeframe("4H");
    expect(r.matched).toBe(true);
  });

  it("reports matched=false and presses Escape when nothing matches", async () => {
    const fake = new FakePageDriver();
    fake.onEvaluate = (expr) => {
      if (expr.includes("location.href")) return { symbol: "X", timeframe: "1D", title: "", href: "" };
      if (expr.includes('role="option"')) return false; // no row matched
      return true; // open interval button
    };
    const adapter = new TvAdapter(fake, instant);
    const r = await adapter.setTimeframe("999");
    expect(r.matched).toBe(false);
    expect(fake.calls.some((c) => c.method === "pressKey" && c.arg === "Escape")).toBe(true);
  });
});

describe("TvAdapter.ping / isTradingView", () => {
  it("ping returns true when the page returns 4", async () => {
    const fake = new FakePageDriver();
    fake.onEvaluate = () => 4;
    const adapter = new TvAdapter(fake, instant);
    expect(await adapter.ping()).toBe(true);
  });
});
