import type { Candle } from "../backtest/types.js";

/**
 * Free, keyless market data from Binance's public data endpoint.
 * No API key, no auth — just OHLCV. This is what lets the backtester run
 * standalone, with no TradingView (or browser) involved.
 */

const BASE = "https://data-api.binance.vision/api/v3/klines";

/** Binance kline intervals we accept. */
export const BINANCE_INTERVALS = [
  "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M",
] as const;
export type BinanceInterval = (typeof BINANCE_INTERVALS)[number];

/** Pure parser: Binance klines → Candle[]. Exported for testing without network. */
export function parseBinanceKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) throw new Error("Binance klines: expected an array");
  return raw.map((k) => {
    const row = k as unknown[];
    return {
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    };
  });
}

/** Normalise common interval codes (e.g. "240", "4H", "D") to Binance's format. */
export function toBinanceInterval(interval: string): BinanceInterval {
  const raw = interval.trim().toLowerCase();
  const map: Record<string, BinanceInterval> = {
    "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
    "60": "1h", "120": "2h", "240": "4h", "360": "6h", "480": "8h", "720": "12h",
    d: "1d", "1d": "1d", w: "1w", "1w": "1w", m: "1M", "1mo": "1M",
  };
  if (map[raw]) return map[raw]!;
  if ((BINANCE_INTERVALS as readonly string[]).includes(raw)) return raw as BinanceInterval;
  return "1h";
}

export interface FetchOptions {
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Fetch recent OHLCV candles for a symbol (e.g. "BTCUSDT") at an interval. */
export async function fetchBinanceCandles(
  symbol: string,
  interval: string,
  limit = 300,
  opts: FetchOptions = {},
): Promise<Candle[]> {
  const f = opts.fetchImpl ?? fetch;
  const sym = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const iv = toBinanceInterval(interval);
  const n = Math.max(1, Math.min(1000, Math.floor(limit)));
  const url = `${BASE}?symbol=${encodeURIComponent(sym)}&interval=${iv}&limit=${n}`;
  const res = await f(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Binance ${res.status} for ${sym} ${iv}: ${body.slice(0, 120)}`);
  }
  return parseBinanceKlines(await res.json());
}
