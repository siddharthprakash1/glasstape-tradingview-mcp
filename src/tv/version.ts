import type { PageDriver } from "../cdp/types.js";

/**
 * Best-effort detection of the TradingView Desktop version.
 *
 * The Electron shell exposes its version in a few places that vary by release;
 * we try each and fall back to null. A known version lets the adapter warn when
 * it is running against an untested build.
 */
export async function detectVersion(driver: PageDriver): Promise<string | null> {
  const expr = `(() => {
    try {
      // 1) Electron/Desktop globals occasionally injected by the shell.
      if (window.TradingViewDesktop && window.TradingViewDesktop.version) return String(window.TradingViewDesktop.version);
      if (window.__TVDesktop && window.__TVDesktop.version) return String(window.__TVDesktop.version);
      // 2) A meta tag some builds emit.
      const meta = document.querySelector('meta[name="tv-app-version"], meta[name="application-version"]');
      if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
      // 3) Body data attribute.
      const v = document.body && document.body.getAttribute('data-app-version');
      if (v) return v;
      return null;
    } catch (e) { return null; }
  })()`;
  try {
    return await driver.evaluate<string | null>(expr, { timeoutMs: 4000 });
  } catch {
    return null;
  }
}
