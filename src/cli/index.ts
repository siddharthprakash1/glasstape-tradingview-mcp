#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { createContext } from "../context.js";
import { startServer } from "../mcp/server.js";
import { runHealthCheck } from "../health/check.js";
import { allTools } from "../domains/index.js";
import { isGlasstapeError } from "../util/errors.js";
import { log, setLogLevel } from "../util/logger.js";

const VERSION = "0.1.0";

const HELP = `glasstape v${VERSION} — drive TradingView Desktop with Claude over CDP

Usage: glasstape <command> [args]

  serve                 Start the MCP server on stdio (for Claude / MCP clients)
  health                Full connection + selector health check
  doctor                Selector self-test (which UI hooks still resolve)
  state                 Print the current chart state
  symbol <TICKER>       Switch the chart symbol (e.g. BTCUSD)
  timeframe <CODE>      Switch the timeframe (e.g. 240, 4H, D)
  legend                Print the chart legend value rows
  screenshot [path]     Save a screenshot (default: ./glasstape-screenshot-<ts>.png)
  targets               List Chrome DevTools targets on the debug port
  eval <expression>     Evaluate a JS expression in the page (advanced)
  tools                 List the MCP tools this server exposes
  version               Print version
  help                  Show this help

Environment:
  GLASSTAPE_PORT (default 9222)   CDP debug port TradingView was launched with
  GLASSTAPE_HOST (default 127.0.0.1)
  GLASSTAPE_LOG  (silent|error|warn|info|debug, default info)
`;

function out(line = ""): void {
  process.stdout.write(line + "\n");
}

async function cmdHealth(): Promise<number> {
  const ctx = createContext();
  try {
    const r = await runHealthCheck(ctx);
    out(r.ok ? "● HEALTHY" : "● UNHEALTHY");
    out(`  CDP        ${r.cdp.connected ? "connected" : "DOWN"}  (${r.cdp.host}:${r.cdp.port})`);
    if (r.cdp.targetTitle) out(`  target     ${r.cdp.targetTitle}`);
    out(`  TradingView ${r.tradingView ? "yes" : "no"}`);
    out(`  version    ${r.version ?? "unknown"}`);
    out(`  selectors  ${r.selectorsOk}/${r.selectorsTotal} resolving`);
    if (r.issues.length) {
      out("  issues:");
      for (const i of r.issues) out(`    - ${i}`);
    }
    return r.ok ? 0 : 1;
  } finally {
    await ctx.cdp.close();
  }
}

async function cmdDoctor(): Promise<number> {
  const ctx = createContext();
  try {
    await ctx.cdp.connect();
    const report = await ctx.tv.selfTest();
    out("Selector self-test:");
    let allOk = true;
    for (const [key, entry] of Object.entries(report)) {
      if (!entry.ok) allOk = false;
      const mark = entry.ok ? "✓" : "✗";
      const which = entry.strategyIndex !== null ? ` (strategy #${entry.strategyIndex})` : "";
      out(`  ${mark} ${key}${which}`);
    }
    return allOk ? 0 : 1;
  } finally {
    await ctx.cdp.close();
  }
}

async function cmdState(): Promise<number> {
  const ctx = createContext();
  try {
    out(JSON.stringify(await ctx.tv.getState(), null, 2));
    return 0;
  } finally {
    await ctx.cdp.close();
  }
}

async function cmdSymbol(symbol: string | undefined): Promise<number> {
  if (!symbol) {
    out("usage: glasstape symbol <TICKER>");
    return 2;
  }
  const ctx = createContext();
  try {
    const r = await ctx.tv.setSymbol(symbol);
    out(JSON.stringify(r, null, 2));
    return 0;
  } finally {
    await ctx.cdp.close();
  }
}

async function cmdTimeframe(tf: string | undefined): Promise<number> {
  if (!tf) {
    out("usage: glasstape timeframe <CODE>");
    return 2;
  }
  const ctx = createContext();
  try {
    const r = await ctx.tv.setTimeframe(tf);
    out(JSON.stringify(r, null, 2));
    return r.matched ? 0 : 1;
  } finally {
    await ctx.cdp.close();
  }
}

async function cmdLegend(): Promise<number> {
  const ctx = createContext();
  try {
    const lines = await ctx.tv.getLegend();
    for (const l of lines) out(`• ${l.text}`);
    if (!lines.length) out("(legend empty or not found)");
    return 0;
  } finally {
    await ctx.cdp.close();
  }
}

async function cmdScreenshot(path: string | undefined): Promise<number> {
  const ctx = createContext();
  try {
    const base64 = await ctx.tv.screenshot({ format: "png" });
    const file = path ?? `glasstape-screenshot-${Date.now()}.png`;
    await writeFile(file, Buffer.from(base64, "base64"));
    out(`Saved ${file}`);
    return 0;
  } finally {
    await ctx.cdp.close();
  }
}

async function cmdTargets(): Promise<number> {
  const ctx = createContext();
  try {
    const targets = await ctx.cdp.listTargets();
    for (const t of targets) out(`[${t.type}] ${t.title} — ${t.url}`);
    return 0;
  } finally {
    await ctx.cdp.close();
  }
}

async function cmdEval(expr: string | undefined): Promise<number> {
  if (!expr) {
    out("usage: glasstape eval <expression>");
    return 2;
  }
  const ctx = createContext();
  try {
    const value = await ctx.cdp.evaluate(expr);
    out(JSON.stringify(value, null, 2));
    return 0;
  } finally {
    await ctx.cdp.close();
  }
}

function cmdTools(): number {
  for (const t of allTools) out(`${t.name.padEnd(20)} ${t.description.split(".")[0]}.`);
  return 0;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "serve") {
    // Server mode: keep stdout clean for MCP; route logs to stderr only.
    setLogLevel(process.env.GLASSTAPE_LOG ? (process.env.GLASSTAPE_LOG as never) : "info");
    const ctx = createContext();
    await startServer(ctx);
    return; // stays alive on the transport
  }

  let code = 0;
  switch (command) {
    case "health": code = await cmdHealth(); break;
    case "doctor": code = await cmdDoctor(); break;
    case "state": code = await cmdState(); break;
    case "symbol": code = await cmdSymbol(rest[0]); break;
    case "timeframe": code = await cmdTimeframe(rest[0]); break;
    case "legend": code = await cmdLegend(); break;
    case "screenshot": code = await cmdScreenshot(rest[0]); break;
    case "targets": code = await cmdTargets(); break;
    case "eval": code = await cmdEval(rest.join(" ")); break;
    case "tools": code = cmdTools(); break;
    case "version": out(VERSION); break;
    case undefined:
    case "help":
    case "--help":
    case "-h": out(HELP); break;
    default:
      out(`Unknown command: ${command}\n`);
      out(HELP);
      code = 2;
  }
  process.exitCode = code;
}

main().catch((e) => {
  const message = isGlasstapeError(e) ? e.toUserString() : e instanceof Error ? e.message : String(e);
  log.error(message);
  process.exitCode = 1;
});
