import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { GlasstapeContext } from "../src/context.js";
import { buildHttpServer } from "../src/http/server.js";
import { GlasstapeError } from "../src/util/errors.js";

function baseCtx(overrides: Record<string, unknown> = {}): GlasstapeContext {
  return {
    cfg: { host: "127.0.0.1", port: 9222, targetMatchers: [], evalTimeoutMs: 1000, httpPort: 0 },
    cdp: {
      connect: async () => {},
      evaluate: async () => "2.0",
      targetInfo: { title: "BTCUSD", url: "https://www.tradingview.com" },
      close: async () => {},
    },
    tv: {
      isTradingView: async () => true,
      selfTest: async () => ({ chartCanvas: { ok: true, strategyIndex: 0 } }),
      getState: async () => ({ symbol: "BTCUSD", timeframe: "4h", title: "BTCUSD 61,000", href: "x" }),
      setSymbol: async (s: string) => ({
        requested: s.toUpperCase(),
        state: { symbol: s.toUpperCase(), timeframe: "4h", title: "", href: "" },
      }),
      setTimeframe: async (tf: string) => ({
        requested: tf,
        matched: true,
        state: { symbol: "BTCUSD", timeframe: "4h", title: "", href: "" },
      }),
      getLegend: async () => [{ text: "O 1 H 2 L 0 C 1" }],
      screenshot: async () => Buffer.from("PNGDATA").toString("base64"),
      ...((overrides.tv as object) ?? {}),
    },
    pine: { setSource: async () => ({ ok: true, method: "monaco" }) },
  } as unknown as GlasstapeContext;
}

async function listen(ctx: GlasstapeContext): Promise<{ server: Server; base: string }> {
  const server = buildHttpServer(ctx);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return { server, base: `http://127.0.0.1:${port}` };
}

let server: Server;
let base: string;
beforeAll(async () => {
  ({ server, base } = await listen(baseCtx()));
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("glasstape HTTP API", () => {
  it("GET /api/health returns the report", async () => {
    const res = await fetch(`${base}/api/health`);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.cdp.connected).toBe(true);
  });

  it("GET /api/state returns chart state", async () => {
    const j = await (await fetch(`${base}/api/state`)).json();
    expect(j.symbol).toBe("BTCUSD");
  });

  it("POST /api/symbol uppercases and switches", async () => {
    const res = await fetch(`${base}/api/symbol`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol: "ethusd" }),
    });
    const j = await res.json();
    expect(j.requested).toBe("ETHUSD");
  });

  it("POST /api/timeframe returns matched", async () => {
    const j = await (
      await fetch(`${base}/api/timeframe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeframe: "4H" }),
      })
    ).json();
    expect(j.matched).toBe(true);
  });

  it("GET /api/screenshot returns a PNG body", async () => {
    const res = await fetch(`${base}/api/screenshot`);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("PNGDATA");
  });

  it("serves the dashboard HTML at /app/", async () => {
    const res = await fetch(`${base}/app/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("glasstape");
  });

  it("404s an unknown API endpoint", async () => {
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });
});

describe("HTTP API error mapping", () => {
  it("returns 502 with the error code when a tool throws", async () => {
    const ctx = baseCtx({
      tv: {
        setSymbol: async () => {
          throw new GlasstapeError("SELECTOR_NOT_FOUND", "no search button", { hint: "run doctor" });
        },
      },
    });
    const { server: s, base: b } = await listen(ctx);
    try {
      const res = await fetch(`${b}/api/symbol`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol: "BTCUSD" }),
      });
      expect(res.status).toBe(502);
      const j = await res.json();
      expect(j.ok).toBe(false);
      expect(j.code).toBe("SELECTOR_NOT_FOUND");
      expect(j.error).toContain("run doctor");
    } finally {
      await new Promise<void>((r) => s.close(() => r()));
    }
  });
});
