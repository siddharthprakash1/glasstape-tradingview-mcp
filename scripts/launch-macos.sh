#!/usr/bin/env bash
# Launch TradingView Desktop (macOS) with the Chrome DevTools debug port enabled.
# The debug port only applies on a FRESH launch, so we quit any running instance first.
set -euo pipefail

PORT="${GLASSTAPE_PORT:-9222}"
APP="${TRADINGVIEW_APP:-TradingView}"

echo "→ Quitting any running TradingView (the debug flag only applies on a fresh launch)…"
osascript -e 'quit app "TradingView"' 2>/dev/null || true
sleep 1

echo "→ Launching $APP with --remote-debugging-port=$PORT …"
open -na "$APP" --args --remote-debugging-port="$PORT"

echo "✓ Launched. Verify the bridge with:  npx glasstape health"
