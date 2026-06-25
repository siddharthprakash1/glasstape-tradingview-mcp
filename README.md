# glasstape

**A typed, self-healing MCP bridge between Claude and TradingView Desktop.**

glasstape lets Claude (or any [Model Context Protocol](https://modelcontextprotocol.io) client) read your charts, switch symbols and timeframes, write Pine Script, take screenshots, and run a real connection health-check — by talking to your **locally running TradingView Desktop** over the Chrome DevTools Protocol (CDP).

It is a ground-up TypeScript reimagining of the community `tradingview-mcp` idea, built to fix the two things that make those bridges painful: **they break silently on TradingView updates, and they're untyped and hard to extend.**

```
Claude ─▶ MCP (stdio) ─▶ typed tools ─▶ TV adapter ─▶ CDP ─▶ TradingView Desktop (:9222)
```

---

## Why glasstape

| | Typical JS bridge | glasstape |
|---|---|---|
| **Breakage** | cryptic stack trace when TradingView changes | version detection + selector **self-test**; `health`/`doctor` tell you *exactly* what moved |
| **Types** | loose JavaScript | end-to-end TypeScript; every tool has a **Zod** schema validated at the boundary |
| **Fragility** | DOM knowledge scattered everywhere | all TradingView-specific knowledge **quarantined** in `src/tv/` |
| **Resilience** | one selector per element | **ordered fallback strategies** per element, first match wins |
| **Testing** | manual only | pure logic unit-tested; a `tv` CLI to drive everything without Claude |

## Requirements

- **Node.js 18+**
- **TradingView Desktop** (the native app — this does not work against the website in a normal browser)
- A TradingView plan appropriate for the features you use (e.g. Bar Replay needs a paid plan)

## Quickstart

```bash
# 1. install & build
npm install
npm run build

# 2. launch TradingView with the debug port (quits & relaunches it)
./scripts/launch-macos.sh          # or launch-windows.ps1 / launch-linux.sh

# 3. verify the bridge sees it
node dist/cli/index.js health
```

A healthy check looks like:

```
● HEALTHY
  CDP        connected  (127.0.0.1:9222)
  target     BTCUSD · 63,000 — TradingView
  TradingView yes
  selectors  5/5 resolving
```

### Connect it to Claude Code

Copy `.mcp.json.example` to your project's `.mcp.json` (or merge it into your existing one):

```json
{
  "mcpServers": {
    "glasstape": {
      "command": "node",
      "args": ["dist/cli/index.js", "serve"],
      "env": { "GLASSTAPE_PORT": "9222" }
    }
  }
}
```

Then just ask Claude:

> "Switch to ETHUSD on the 4H, add an RSI, and screenshot it."

## CLI

The `glasstape` CLI mirrors the tools so you can test without an MCP client:

```
glasstape serve                 Start the MCP server on stdio
glasstape health                Full connection + selector health check
glasstape doctor                Selector self-test (which UI hooks resolve)
glasstape state                 Print the current chart state
glasstape symbol BTCUSD         Switch symbol
glasstape timeframe 4H          Switch timeframe (1,5,15,60,240,4H,D,W,1mo…)
glasstape legend                Print legend OHLC/indicator values
glasstape screenshot [path]     Save a PNG screenshot
glasstape eval "<expr>"         Evaluate JS in the page (advanced)
glasstape targets               List CDP targets on the debug port
glasstape tools                 List the MCP tools
```

## MCP tools

| Tool | What it does |
|---|---|
| `health` | Full bridge diagnostic: CDP, target, version, selector self-test |
| `get_chart_state` | Current symbol, timeframe, title, URL |
| `set_symbol` | Switch symbol via the search dialog |
| `set_timeframe` | Switch interval via the interval menu |
| `get_legend` | OHLC + indicator values from the legend |
| `focus_chart` | Give keyboard focus to the chart |
| `screenshot` | Capture the window (optionally clipped) |
| `pine_set_source` | Write Pine source into the open Pine Editor |
| `pine_get_console` | Read Pine console output |
| `pine_get_errors` | Read Pine compile error markers |
| `list_targets` | List CDP targets (diagnostics) |
| `tv_evaluate` | Advanced escape hatch: run JS in the page |

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `GLASSTAPE_PORT` | `9222` | CDP debug port TradingView was launched with |
| `GLASSTAPE_HOST` | `127.0.0.1` | CDP host |
| `GLASSTAPE_LOG` | `info` | `silent\|error\|warn\|info\|debug` (logs go to **stderr**) |
| `GLASSTAPE_EVAL_TIMEOUT_MS` | `15000` | Per-evaluation timeout |

## Architecture

Layered so the fragile parts can't poison the stable parts. See [`docs/superpowers/specs/2026-06-25-glasstape-design.md`](docs/superpowers/specs/2026-06-25-glasstape-design.md) for the full design.

```
src/
  cdp/       transport: chrome-remote-interface, target discovery, reconnect, evaluate/input
  tv/        the ONLY TradingView-specific code (selectors, adapter, pine, intervals, version)
  domains/   typed tool definitions (chart, pine, capture, system)
  mcp/       registry + stdio server (Zod → JSON Schema, validate, dispatch)
  health/    end-to-end diagnostic
  cli/       `glasstape <command>`
  util/      errors, logger (stderr-only), retry/backoff
web/         the landing page (design prototype)
```

**When TradingView breaks something, you only touch `src/tv/selectors.ts`.** Run `glasstape doctor` to see which hooks stopped resolving.

## Development

```bash
npm run dev -- health     # run the CLI from source (tsx)
npm run typecheck         # tsc --noEmit
npm test                  # vitest (31 unit tests)
npm run build             # emit dist/
```

## How it works (and what's solid vs. best-effort)

glasstape talks to the Electron debug interface TradingView Desktop exposes when launched with `--remote-debugging-port`. **No data is sent to any server** — everything is local.

- **Solid today:** CDP connect & target discovery, `health`/`doctor`, screenshots, reading chart state, `tv_evaluate`, symbol switching, timeframe switching.
- **Best-effort / tune on first run:** the exact DOM selectors in `src/tv/selectors.ts` track TradingView's current build. If a hook doesn't resolve, `doctor` flags it and you update one file. Pine source-injection needs the Pine Editor open (it uses Monaco's model API).

## Legal & safety

> ⚠️ **Unofficial and experimental.** glasstape is **not affiliated with, endorsed by, or associated with TradingView, Inc.** It drives undocumented internal interfaces over CDP and **can break on any TradingView update**. You are responsible for complying with [TradingView's Terms of Use](https://www.tradingview.com/policies/) — automated or non-display use of their data may conflict with those terms. Provided for **personal, educational, and research use**. All processing is local.
>
> **Security note:** connecting an MCP client grants it the ability to run actions in your logged-in TradingView session. The `tv_evaluate` tool in particular executes arbitrary JavaScript inside the page (an intentional power-user escape hatch) and therefore has full access to that session's state. Only connect clients you trust, and consider removing `tv_evaluate` from `src/domains/system.ts` if you don't need it.

## License

[MIT](LICENSE) — applies to glasstape source only, not to TradingView's software, data, or trademarks.
