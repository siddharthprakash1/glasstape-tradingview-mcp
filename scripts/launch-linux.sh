#!/usr/bin/env bash
# Launch TradingView Desktop (Linux) with the Chrome DevTools debug port enabled.
# The debug port only applies on a fresh launch, so we stop any running instance first.
set -euo pipefail

PORT="${GLASSTAPE_PORT:-9222}"
BIN="${TRADINGVIEW_BIN:-tradingview}"

echo "→ Stopping any running TradingView (the debug flag only applies on a fresh launch)…"
pkill -f "$BIN" 2>/dev/null || true
sleep 1

echo "→ Launching $BIN with --remote-debugging-port=$PORT …"
"$BIN" --remote-debugging-port="$PORT" >/dev/null 2>&1 &

echo "✓ Launched. Verify the bridge with:  npx glasstape health"
