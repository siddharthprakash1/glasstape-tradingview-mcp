import type { GlasstapeContext } from "../context.js";
import { detectVersion } from "../tv/version.js";
import { SELECTORS, type SelectorDef, type SelfTestReport } from "../tv/selectors.js";
import { isGlasstapeError } from "../util/errors.js";

/** Selector keys that are optional (Phase-2 / plan-gated) and must not degrade health. */
const OPTIONAL_SELECTORS = new Set(
  Object.entries(SELECTORS)
    .filter(([, def]) => (def as SelectorDef).optional)
    .map(([key]) => key),
);

/** Whether a selector key is required for a healthy verdict (optional hooks are not). */
function isRequired(key: string): boolean {
  return !OPTIONAL_SELECTORS.has(key);
}

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

  // Verdict is based on REQUIRED selectors only; optional (Phase-2) hooks are
  // reported in `selectors` but never degrade health.
  const requiredEntries = Object.entries(selectors).filter(([k]) => isRequired(k));
  const selectorsTotal = requiredEntries.length;
  const selectorsOk = requiredEntries.filter(([, v]) => v.ok).length;
  if (connected && tradingView && selectorsTotal > 0 && selectorsOk < selectorsTotal) {
    const broken = requiredEntries.filter(([, v]) => !v.ok).map(([k]) => k);
    issues.push(`Some required UI selectors did not resolve (${broken.join(", ")}). TradingView may have updated — update src/tv/selectors.ts.`);
  }

  const target = ctx.cdp.targetInfo;
  const ok = connected && tradingView && selectorsTotal > 0 && selectorsOk === selectorsTotal;

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
