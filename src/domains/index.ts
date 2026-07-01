import { assertUniqueNames, type ToolDef } from "../mcp/registry.js";
import { chartTools } from "./chart.js";
import { pineTools } from "./pine.js";
import { captureTools } from "./capture.js";
import { systemTools } from "./system.js";
import { markupTools } from "./markup.js";
import { backtestTools } from "./backtest.js";

/** The full set of MCP tools glasstape exposes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const allTools: ReadonlyArray<ToolDef<any>> = [
  ...systemTools,
  ...chartTools,
  ...markupTools,
  ...backtestTools,
  ...pineTools,
  ...captureTools,
];

assertUniqueNames(allTools);
