import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { GlasstapeContext } from "../context.js";
import { runBacktest, STRATEGIES } from "../backtest/index.js";
import { runHealthCheck } from "../health/check.js";
import { isGlasstapeError } from "../util/errors.js";
import { log } from "../util/logger.js";

/**
 * Optional HTTP bridge so a browser dashboard can drive glasstape.
 *
 * The MCP server speaks stdio (for Claude); this exposes the same capabilities
 * over plain HTTP/JSON and serves the static `web/` site (landing + dashboard).
 * Built on Node's `http` — no extra dependencies.
 */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

// dist/http/server.js → ../../web
const WEB_DIR = fileURLToPath(new URL("../../web", import.meta.url));

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5_000_000) req.destroy(); // guard against huge bodies
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}

async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function handleApi(
  ctx: GlasstapeContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const method = req.method ?? "GET";
  const pathname = url.pathname;
  try {
    if (method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, await runHealthCheck(ctx));
    }
    if (method === "GET" && pathname === "/api/state") {
      return sendJson(res, 200, await ctx.tv.getState());
    }
    if (method === "GET" && pathname === "/api/legend") {
      return sendJson(res, 200, { lines: await ctx.tv.getLegend() });
    }
    if (method === "GET" && pathname === "/api/candles") {
      const count = Number.parseInt(url.searchParams.get("count") ?? "50", 10);
      return sendJson(res, 200, await ctx.tv.getCandles(Number.isFinite(count) ? count : 50));
    }
    if (method === "GET" && pathname === "/api/drawings") {
      return sendJson(res, 200, await ctx.tv.listDrawings());
    }
    if (method === "POST" && pathname === "/api/drawings/clear") {
      return sendJson(res, 200, await ctx.tv.removeAllDrawings());
    }
    if (method === "GET" && pathname === "/api/strategies") {
      return sendJson(res, 200, {
        strategies: Object.values(STRATEGIES).map((s) => ({ name: s.name, description: s.description, defaults: s.defaults })),
      });
    }
    if (method === "POST" && pathname === "/api/backtest") {
      const body = await parseJsonBody(req);
      const strategy = String(body.strategy ?? "");
      if (!(strategy in STRATEGIES)) {
        return sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: `strategy must be one of ${Object.keys(STRATEGIES).join(", ")}` });
      }
      const count = typeof body.count === "number" ? body.count : 300;
      const data = await ctx.tv.getCandles(count);
      if (!data.ok || !data.candles || data.candles.length < 30) {
        return sendJson(res, 502, { ok: false, code: "TV_NOT_READY", error: "Could not read enough candles to backtest." });
      }
      const params = (body.params && typeof body.params === "object" ? body.params : {}) as Record<string, number>;
      const config = {
        feeBps: typeof body.feeBps === "number" ? body.feeBps : undefined,
        slippageBps: typeof body.slippageBps === "number" ? body.slippageBps : undefined,
      };
      const result = runBacktest(data.candles, strategy, params, config);
      return sendJson(res, 200, { ok: true, symbol: data.symbol, resolution: data.resolution, ...result });
    }
    if (method === "GET" && pathname === "/api/screenshot") {
      const b64 = await ctx.tv.screenshot({ format: "png" });
      const buf = Buffer.from(b64, "base64");
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      return void res.end(buf);
    }
    if (method === "POST" && pathname === "/api/symbol") {
      const { symbol } = await parseJsonBody(req);
      return sendJson(res, 200, await ctx.tv.setSymbol(String(symbol ?? "")));
    }
    if (method === "POST" && pathname === "/api/timeframe") {
      const { timeframe } = await parseJsonBody(req);
      return sendJson(res, 200, await ctx.tv.setTimeframe(String(timeframe ?? "")));
    }
    if (method === "POST" && pathname === "/api/pine") {
      const { source } = await parseJsonBody(req);
      return sendJson(res, 200, await ctx.pine.setSource(String(source ?? "")));
    }
    if (method === "POST" && pathname === "/api/indicator") {
      const { name } = await parseJsonBody(req);
      return sendJson(res, 200, await ctx.tv.addIndicator(String(name ?? "")));
    }
    if (method === "POST" && pathname === "/api/chart-type") {
      const { type } = await parseJsonBody(req);
      return sendJson(res, 200, await ctx.tv.setChartType(String(type ?? "")));
    }
    if (method === "POST" && pathname === "/api/layout") {
      const { layout } = await parseJsonBody(req);
      return sendJson(res, 200, await ctx.tv.setLayout(String(layout ?? "")));
    }
    if (method === "POST" && pathname === "/api/alert") {
      return sendJson(res, 200, await ctx.tv.createAlert());
    }
    if (method === "POST" && pathname === "/api/replay") {
      const a = String((await parseJsonBody(req)).action ?? "");
      if (!["start", "step", "play", "stop"].includes(a)) {
        return sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: "action must be start|step|play|stop" });
      }
      return sendJson(res, 200, await ctx.tv.replay(a as "start" | "step" | "play" | "stop"));
    }
    if (method === "POST" && pathname === "/api/drawing") {
      const body = await parseJsonBody(req);
      const k = String(body.kind ?? "");
      if (!["horizontal", "trend"].includes(k)) {
        return sendJson(res, 400, { ok: false, code: "INVALID_INPUT", error: "kind must be horizontal|trend" });
      }
      const price = typeof body.price === "number" ? body.price : undefined;
      return sendJson(res, 200, await ctx.tv.addDrawing(k as "horizontal" | "trend", { price }));
    }
    return sendJson(res, 404, { ok: false, error: `Unknown endpoint: ${method} ${pathname}` });
  } catch (e) {
    const code = isGlasstapeError(e) ? e.code : "EVAL_FAILED";
    const error = isGlasstapeError(e)
      ? e.toUserString()
      : e instanceof Error
        ? e.message
        : String(e);
    return sendJson(res, 502, { ok: false, error, code });
  }
}

async function handleStatic(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  let p = pathname;
  if (p === "/") p = "/index.html";
  if (p === "/app" || p === "/app/") p = "/app/index.html";

  const safe = normalize(p).replace(/^(\.\.[/\\])+/, "");
  const file = join(WEB_DIR, safe);
  if (!file.startsWith(WEB_DIR)) {
    res.writeHead(403, { "content-type": "text/plain" });
    return void res.end("Forbidden");
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}

/** Build the HTTP server (not yet listening) — exported so tests can inject a fake context. */
export function buildHttpServer(ctx: GlasstapeContext): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      void handleApi(ctx, req, res, url);
    } else {
      void handleStatic(req, res, url.pathname);
    }
  });
}

/** Start the HTTP server and resolve once it is listening. */
export function startHttpServer(ctx: GlasstapeContext, port = ctx.cfg.httpPort): Promise<Server> {
  const server = buildHttpServer(ctx);
  return new Promise((resolve) => {
    // Bind to loopback only — the API grants unauthenticated control of the
    // logged-in TradingView session and must not be reachable from the LAN.
    server.listen(port, "127.0.0.1", () => {
      const base = `http://localhost:${port}`;
      // Not MCP mode, so stdout is safe and useful here.
      process.stdout.write(`\nglasstape dashboard → ${base}/app/\nlanding page      → ${base}/\nAPI               → ${base}/api/health\n\n`);
      log.info(`HTTP server listening on ${base}`);
      resolve(server);
    });
  });
}
