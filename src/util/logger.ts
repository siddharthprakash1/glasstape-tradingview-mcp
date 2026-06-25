/**
 * Minimal leveled logger.
 *
 * CRITICAL: the MCP stdio transport owns stdout for JSON-RPC framing. Writing
 * anything else to stdout corrupts the protocol, so every log line goes to
 * stderr. Level is controlled by GLASSTAPE_LOG (silent|error|warn|info|debug).
 */

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.GLASSTAPE_LOG ?? "info").toLowerCase();
  return (raw in ORDER ? raw : "info") as LogLevel;
}

let currentLevel: LogLevel = resolveLevel();

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function emit(level: Exclude<LogLevel, "silent">, args: unknown[]): void {
  if (ORDER[level] > ORDER[currentLevel]) return;
  const tag = `[glasstape:${level}]`;
  // eslint-disable-next-line no-console
  console.error(tag, ...args);
}

export const log = {
  error: (...args: unknown[]) => emit("error", args),
  warn: (...args: unknown[]) => emit("warn", args),
  info: (...args: unknown[]) => emit("info", args),
  debug: (...args: unknown[]) => emit("debug", args),
};
