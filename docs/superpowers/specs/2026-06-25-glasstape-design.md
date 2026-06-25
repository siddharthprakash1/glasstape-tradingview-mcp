# glasstape — Design

**Date:** 2026-06-25
**Status:** Phase 1 (Parity Core) implemented

## Summary

glasstape is an open-source, TypeScript MCP server that bridges Claude (and any
MCP client) to a locally running **TradingView Desktop** over the Chrome
DevTools Protocol. It is a clean-room reimagining of the community
`tradingview-mcp` concept, differentiated on **reliability**, **type-safety**,
**architecture/DX**, and a roadmap toward **trustworthy backtesting**.

## Goals

1. **Parity** on the tools traders actually use: read chart state, switch
   symbol/timeframe, read the legend, Pine source/console/errors, screenshots.
2. **Reliability:** survive TradingView updates — or fail loudly and
   diagnosably. Version detection + per-element fallback selectors + a
   self-test surfaced through `health`/`doctor`.
3. **Type-safety:** every tool has a Zod schema validated at the MCP boundary;
   internal layers are fully typed.
4. **Contributor-friendly:** small, single-purpose modules; all fragile
   TradingView knowledge isolated in one place.

## Non-goals (this phase)

- Live order execution / brokerage integration.
- Real OHLCV pull + vectorized backtesting (Phase 3).
- Replay/drawings/alerts/multi-pane tools (Phase 2).

## Architecture

A strict dependency direction keeps fragility contained:

```
cli ─┐
mcp ─┼─▶ domains ─▶ tv (adapter/pine/selectors) ─▶ cdp (transport) ─▶ TradingView
health ┘                         ▲
                                 └── the ONLY TradingView-specific code
```

| Layer | Module | Responsibility |
|---|---|---|
| Transport | `cdp/client.ts` | `chrome-remote-interface`: list/pick target, connect with retry, reconnect on drop, `evaluate`, screenshot, keyboard/mouse input. Implements `PageDriver`. |
| Seam | `cdp/types.ts` | `PageDriver` interface — the only thing upper layers depend on (testable with a fake). |
| TradingView | `tv/selectors.ts` | Resilient selector registry: ordered strategies + self-test expression. **The breakage surface.** |
| TradingView | `tv/adapter.ts` | High-level chart ops (state, symbol, timeframe, legend, focus, screenshot). |
| TradingView | `tv/pine.ts` | Pine editor: Monaco source-injection, console/errors. |
| TradingView | `tv/intervals.ts` | Pure timeframe-code → label normalisation (unit-tested). |
| TradingView | `tv/version.ts` | Best-effort version detection. |
| Tools | `domains/*` | Typed `ToolDef`s grouped by capability (chart, pine, capture, system). |
| Protocol | `mcp/registry.ts` | `ToolDef`/`ToolResult` types, `defineTool`, uniqueness assertion. |
| Protocol | `mcp/server.ts` | Low-level MCP `Server`: ListTools (Zod→JSON Schema), CallTool (validate, dispatch, map to content blocks, structured errors). |
| Diagnostics | `health/check.ts` | Never-throwing end-to-end probe → actionable `HealthReport`. |
| Entry | `cli/index.ts` | `glasstape <command>` mirror + `serve`. |
| Util | `util/{errors,logger,retry}.ts` | Typed errors with hints; stderr-only logger (protects MCP stdout); backoff. |

### Key design decisions

- **Low-level MCP `Server`** (not the high-level helper) for version stability;
  schemas generated from Zod via `zod-to-json-schema`.
- **stderr-only logging.** The stdio transport owns stdout; any stray stdout
  write corrupts JSON-RPC framing.
- **Errors carry a `code` + `hint`.** Boundaries render the hint, so users get
  "run `glasstape doctor`" instead of a stack trace.
- **`PageDriver` seam** makes the adapter unit-testable without a browser.
- **Injectable delays** in the adapter for instant, deterministic tests.

## Error handling

- Transport drops → transparent reconnect on next call (retry/backoff).
- Missing selector → `SELECTOR_NOT_FOUND` with a hint to run `doctor` and edit
  `selectors.ts`.
- Page eval throws → `EVAL_FAILED` with the page's exception text.
- Tool args invalid → Zod error rendered as a readable message; MCP `isError`.
- `health` never throws — it collects issues from every layer.

## Testing

- Pure logic: `retry` (backoff determinism, attempt/stop semantics),
  `intervals`, `selectors` expression builders, `registry`/schema generation.
- Adapter behaviour via a fake `PageDriver` (symbol/timeframe sequences,
  error paths).
- `health` degradation via a fake context.
- Protocol: an MCP stdio smoke test (initialize → tools/list → tools/call).
- Live integration against real TradingView is manual via the CLI (documented).

## Roadmap

- **Phase 2 — full parity + reliability:** replay, drawings, alerts,
  multi-pane, indicator extraction, watchlist; richer version→selector
  compatibility map; auto-recovery; a "selector contract" CI.
- **Phase 3 — beyond parity:** real OHLCV pull + vectorized backtesting with
  fees/slippage/out-of-sample and **overfitting guardrails**; a polished
  landing site wiring ShaderGradient + react-three-fiber + Paper Shaders
  (liquid-metal wordmark) + liquid-glass-js.
