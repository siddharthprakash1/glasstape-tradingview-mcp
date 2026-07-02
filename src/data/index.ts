import type { Candle } from "../backtest/types.js";
import { fetchBinanceCandles } from "./binance.js";

export { fetchBinanceCandles, parseBinanceKlines, toBinanceInterval, BINANCE_INTERVALS } from "./binance.js";
export type { BinanceInterval } from "./binance.js";

export type DataSource = "binance";

export const DATA_SOURCES: DataSource[] = ["binance"];

/**
 * Fetch OHLCV candles from a standalone data source (no TradingView needed).
 * This is what makes the backtester a real tool rather than a wrapper.
 */
export async function fetchCandles(
  source: DataSource,
  symbol: string,
  interval: string,
  limit = 300,
): Promise<{ source: DataSource; symbol: string; interval: string; candles: Candle[] }> {
  switch (source) {
    case "binance": {
      const candles = await fetchBinanceCandles(symbol, interval, limit);
      return { source, symbol, interval, candles };
    }
    default:
      throw new Error(`Unknown data source '${source}'. Available: ${DATA_SOURCES.join(", ")}`);
  }
}
