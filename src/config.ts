/** Runtime configuration, resolved from environment with sane defaults. */

export interface GlasstapeConfig {
  /** Chrome DevTools Protocol host. */
  host: string;
  /** Chrome DevTools Protocol port (TradingView's --remote-debugging-port). */
  port: number;
  /** Substrings used to recognise the TradingView page among Electron targets. */
  targetMatchers: string[];
  /** Default timeout (ms) for a single page evaluation. */
  evalTimeoutMs: number;
  /** Port for the optional HTTP API + dashboard (`glasstape http`). */
  httpPort: number;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(overrides: Partial<GlasstapeConfig> = {}): GlasstapeConfig {
  return {
    host: process.env.GLASSTAPE_HOST ?? "127.0.0.1",
    port: intFromEnv("GLASSTAPE_PORT", 9222),
    targetMatchers: ["tradingview"],
    evalTimeoutMs: intFromEnv("GLASSTAPE_EVAL_TIMEOUT_MS", 15_000),
    httpPort: intFromEnv("GLASSTAPE_HTTP_PORT", 8787),
    ...overrides,
  };
}
