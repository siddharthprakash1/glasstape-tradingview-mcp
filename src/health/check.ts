import type { GlasstapeContext } from "../context.js";
import { detectVersion } from "../tv/version.js";
import type { SelfTestReport } from "../tv/selectors.js";
import { isGlasstapeError } from "../util/errors.js";

export interface HealthReport {
  /** Overall verdict: connected, attached to TradingView, and selectors resolving. */
  ok: boolean;
  cdp: {
    connected: boolean;
    host: string;
    port: number;
    targetTitle?: string;
    targetUrl?: string;
  };
  tradingView: boolean;
  version: string | null;
  selectors: SelfTestReport;
  selectorsOk: number;
  selectorsTotal: number;
  /** Human-readable problems, ordered most-blocking first. */
  issues: string[];
}

function describe(e: unknown): string {
  if (isGlasstapeError(e)) return e.toUserString();
  return e instanceof Error ? e.message : String(e);
}

/**
 * Probe every layer end-to-end and return an actionable report. Never throws —
 * a failure at any layer is captured as an issue so the caller always gets a
 * full picture.
 */
export async function runHealthCheck(ctx: GlasstapeContext): Promise<HealthReport> {
  const issues: string[] = [];
  let connected = false;
  let tradingView = false;
  let version: string | null = null;
  let selectors: SelfTestReport = {};

  try {
    await ctx.cdp.connect();
    connected = true;
  } catch (e) {
    issues.push(describe(e));
  }

  if (connected) {
    try {
      tradingView = await ctx.tv.isTradingView();
      if (!tradingView) {
        issues.push("Connected target does not look like TradingView (open a chart window).");
      }
    } catch (e) {
      issues.push(`TradingView check failed: ${describe(e)}`);
    }
    try {
      version = await detectVersion(ctx.cdp);
    } catch {
      /* version is best-effort */
    }
    try {
      selectors = await ctx.tv.selfTest();
    } catch (e) {
      issues.push(`Selector self-test failed: ${describe(e)}`);
    }
  }

  const entries = Object.values(selectors);
  const selectorsTotal = entries.length;
  const selectorsOk = entries.filter((s) => s.ok).length;
  if (connected && tradingView && selectorsTotal > 0 && selectorsOk < selectorsTotal) {
    const broken = Object.entries(selectors)
      .filter(([, v]) => !v.ok)
      .map(([k]) => k);
    issues.push(`Some UI selectors did not resolve (${broken.join(", ")}). TradingView may have updated — update src/tv/selectors.ts.`);
  }

  const target = ctx.cdp.targetInfo;
  const ok = connected && tradingView && selectorsTotal > 0 && selectorsOk > 0;

  return {
    ok,
    cdp: {
      connected,
      host: ctx.cfg.host,
      port: ctx.cfg.port,
      targetTitle: target?.title,
      targetUrl: target?.url,
    },
    tradingView,
    version,
    selectors,
    selectorsOk,
    selectorsTotal,
    issues,
  };
}
