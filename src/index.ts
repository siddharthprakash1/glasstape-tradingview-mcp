/**
 * Public programmatic API for glasstape. Import this if you want to embed the
 * bridge in your own Node app instead of running the CLI/MCP server.
 */
export { createContext, type GlasstapeContext } from "./context.js";
export { loadConfig, type GlasstapeConfig } from "./config.js";
export { CdpClient } from "./cdp/client.js";
export type { PageDriver, CdpTarget, ScreenshotOptions } from "./cdp/types.js";
export { TvAdapter, type ChartState } from "./tv/adapter.js";
export { PineController } from "./tv/pine.js";
export { intervalLabelCandidates } from "./tv/intervals.js";
export { SELECTORS, type SelectorKey, type SelfTestReport } from "./tv/selectors.js";
export { buildServer, startServer } from "./mcp/server.js";
export { allTools } from "./domains/index.js";
export { runHealthCheck, type HealthReport } from "./health/check.js";
export { GlasstapeError, type ErrorCode } from "./util/errors.js";
