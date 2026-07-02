# Contributing to glasstape

Thanks for looking! A few notes to make changes painless.

## Setup

```bash
npm install
npm run build      # tsc → dist/
npm test           # vitest (pure logic; no browser needed)
npm run typecheck
```

To run against a live chart, launch TradingView Desktop (or any Chromium) with
`--remote-debugging-port=9222` (see `scripts/`), then `node dist/cli/index.js health`.

## Architecture (where things go)

- `src/cdp/` — the CDP transport. The only place that touches
  `chrome-remote-interface`. Exposes the `PageDriver` interface.
- `src/tv/` — **the only TradingView-specific code.** Selectors, the adapter,
  Pine, and the internal-API calls live here. When TradingView changes, this is
  the file you touch. Everything else is generic.
- `src/domains/` — typed MCP tool definitions (one file per capability).
- `src/backtest/` — **pure, dependency-free** engine, indicators, strategies,
  analysis. No TradingView/CDP imports allowed here — keep it testable.
- `src/data/` — standalone market-data sources (Binance).
- `src/mcp/`, `src/http/`, `src/cli/` — the three ways to drive it.

## When TradingView breaks something

Run `glasstape doctor`. It self-tests every UI selector and tells you which hook
stopped resolving. Fix it in `src/tv/selectors.ts` — nowhere else should need to
change.

## Adding a strategy

Add an entry to `STRATEGIES` in `src/backtest/strategies.ts`. A strategy is just
`(candles, params) => number[]` returning a 0/1 position per bar; the engine does
the rest. Add a test in `tests/`.

## Conventions

- TypeScript strict mode; every MCP tool has a Zod input schema.
- Logs go to **stderr** only (stdout is the MCP transport).
- New pure logic gets unit tests. UI-automation paths are best-effort and
  documented honestly in the README's control-reliability table.

## Legal

This is an unofficial, undocumented-interface project — see the disclaimer in the
README. Don't add anything that violates TradingView's Terms of Use.
