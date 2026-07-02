# Reverse-engineering TradingView (and driving it with an LLM)

TradingView has no public automation API. glasstape drives the **real desktop
app** anyway, over the Chrome DevTools Protocol (CDP). Getting there meant
solving a chain of problems that each looked like a dead end. This is the story
— it's the interesting part of the project.

## 1. Getting a foothold: CDP into an Electron app

TradingView Desktop is an Electron (Chromium) app. Launched with
`--remote-debugging-port=9222`, it exposes the same CDP interface Chrome does.
glasstape connects with `chrome-remote-interface`, finds the TradingView page
among the Electron targets, and can now `Runtime.evaluate` arbitrary JS in the
page and dispatch synthetic input. That's the foothold.

The design rule from day one: **quarantine everything TradingView-specific**
behind one adapter (`src/tv/`) so the rest of the codebase stays typed and
stable. Everything below is contained there.

## 2. "Why won't the menus open?" — React ignores synthetic clicks

First wall. Reading chart state worked; opening menus didn't. Injecting
`element.click()` on the indicators button did nothing.

The button is a `<div>` wrapper around a React `<button>`, and **React's
synthetic event system ignores a programmatic `.click()`** — it listens for real
pointer events. Fix: resolve the element's bounding box in-page, then dispatch a
**real CDP mouse click** (`Input.dispatchMouseEvent`) at its centre. Menus and
dialogs started opening. (Kept an in-page `.click()` fallback for off-screen
nodes.)

## 3. The one that took all day: the search box that wouldn't search

The Indicators dialog opened, the search input focused, and I could set its
value to `"RSI"` — but **no results ever appeared**. I tried everything:

- `Input.insertText` — value set, no filter.
- Real per-character key events (`keyDown`/`keyUp` with `text`) — value set, no filter.
- React's native-setter + dispatched `input` event (the standard controlled-input trick) — value set, no filter.

The value was always right; the list never filtered. So the search wasn't
listening to input events at all — it was gated on something else.

It was **`document.hasFocus()`**. TradingView suppresses dialog-search filtering
when the document doesn't have focus — and when you drive a window headlessly,
it never does (some other window is always frontmost). Bringing the window to
the foreground made the exact same code return 35 results instantly.

The fix is one line, and it's the right one for headless automation:

```js
await client.Emulation.setFocusEmulationEnabled({ enabled: true });
```

Now the page always believes it's focused. This didn't just fix indicators — it
unblocked every focus-gated interaction, and it's the difference between a bridge
that only works when you're staring at it and one that works in the background.

## 4. Trend lines: stop simulating, start calling

Drawing a horizontal line worked (one click). Trend lines need a two-point
click-drag on a `<canvas>`, and **no synthetic-input variation completed it** —
drag, click-click, click-move-click, toolbar-select-then-drag. The canvas simply
wouldn't accept a programmatic two-point draw.

So I stopped simulating a user and looked for the program. Enumerating the page
globals turned up `window.TradingViewApi` and, under it,
`activeChart().createMultipointShape(...)` and `createShape(...)` — TradingView's
own internal charting API. Calling it directly:

```js
const chart = window.TradingViewApi.activeChart();
await chart.createMultipointShape(
  [{ time: t1, price: p1 }, { time: t2, price: p2 }],
  { shape: "trend_line" },
);
```

Trend lines now place instantly, with exact coordinates — more reliable than any
mouse simulation, and it unlocked `removeAllShapes`, `getAllShapes`, and
horizontal lines pinned to an exact price.

## 5. Real data: `getSeries().data()`

The same `activeChart()` exposes `getSeries().data()` — the actual OHLCV series
(`[time, open, high, low, close, volume]`, hundreds of bars). That's real,
structured market data, not scraped from the legend DOM. It became `get_candles`
— and the foundation for the backtesting engine, the one part of glasstape that
isn't a wrapper at all.

## 6. What made it survivable

Undocumented internals break. glasstape is built so breakage is **visible and
localised**, not silent:

- Every UI hook has **ordered fallback selectors** and a self-test surfaced
  through `glasstape doctor` — when TradingView changes, you see exactly which
  hook stopped resolving.
- All of it lives in **one file** (`src/tv/`), behind a typed `PageDriver`
  interface, so the transport is testable with a fake and the rest of the app
  never touches a selector.
- Errors carry a code + a hint ("run `glasstape doctor`"), not a stack trace.

## Takeaways

- Synthetic input is a leaky abstraction over a real UI framework. When it
  fights you, look for the app's own API instead of simulating harder.
- The best bug of the project (`document.hasFocus()`) was invisible: everything
  reported success, nothing happened. Finding it meant forming a hypothesis about
  *why* the app would behave differently under automation, then testing it.
- "It's a wrapper" is only a weakness if the wrapper is all there is. The
  reverse-engineering and the backtesting engine are the parts that aren't.
