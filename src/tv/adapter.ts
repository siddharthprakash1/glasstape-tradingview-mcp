import type { PageDriver, ScreenshotOptions } from "../cdp/types.js";
import { GlasstapeError } from "../util/errors.js";
import { log } from "../util/logger.js";
import { intervalLabelCandidates } from "./intervals.js";
import {
  SELECTORS,
  selfTestExpr,
  type SelectorDef,
  type SelfTestReport,
} from "./selectors.js";

export interface ChartState {
  /** Symbol read from the legend, or null if not found. */
  symbol: string | null;
  /** Timeframe read from the interval control, or null. */
  timeframe: string | null;
  /** Raw document title (often contains symbol + last price). */
  title: string;
  /** Page URL. */
  href: string;
}

export interface LegendLine {
  text: string;
}

/**
 * High-level TradingView operations expressed over a {@link PageDriver}.
 *
 * This is the ONLY place (besides selectors.ts) that encodes TradingView
 * behaviour. Everything above it — domains, MCP tools, CLI — is generic and
 * stable. All DOM access flows through the resilient selector strategies so a
 * platform update degrades to a clear, actionable error rather than silence.
 */
export class TvAdapter {
  constructor(
    private readonly driver: PageDriver,
    /** Injectable delay (tests pass a no-op for instant, deterministic runs). */
    private readonly sleepFn: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  private delay(ms: number): Promise<void> {
    return this.sleepFn(ms);
  }

  /** Confirm the page is responsive. */
  async ping(): Promise<boolean> {
    const v = await this.driver.evaluate<number>("(() => 2 + 2)()", { timeoutMs: 4000 });
    return v === 4;
  }

  /** Heuristic check that we are actually attached to TradingView. */
  async isTradingView(): Promise<boolean> {
    const expr = `(() => {
      try {
        const h = (location.host || '').toLowerCase();
        if (h.includes('tradingview')) return true;
        if (document.querySelector('[class*="tv-"], [data-name]')) return true;
        return /tradingview/i.test(document.title);
      } catch (e) { return false; }
    })()`;
    return this.driver.evaluate<boolean>(expr, { timeoutMs: 4000 });
  }

  /** Run the selector self-test (used by health / doctor). */
  async selfTest(): Promise<SelfTestReport> {
    return this.driver.evaluate<SelfTestReport>(selfTestExpr(), { timeoutMs: 5000 });
  }

  /** Read the current chart state (best effort). */
  async getState(): Promise<ChartState> {
    const expr = `(() => {
      const q = (sels) => { for (const s of sels) { try { const el = document.querySelector(s); if (el) return el; } catch (e) {} } return null; };
      const titleEl = q(${JSON.stringify(SELECTORS.legendTitle.strategies)});
      const intervalEl = q(${JSON.stringify(SELECTORS.intervalButton.strategies)});
      return {
        symbol: titleEl ? (titleEl.textContent || '').trim() : null,
        timeframe: intervalEl ? (intervalEl.textContent || '').trim() : null,
        title: document.title || '',
        href: location.href || ''
      };
    })()`;
    return this.driver.evaluate<ChartState>(expr);
  }

  /** Read the legend value rows (OHLC + indicators) as text lines. */
  async getLegend(): Promise<LegendLine[]> {
    const expr = `(() => {
      const q = (sels) => { for (const s of sels) { try { const els = document.querySelectorAll(s); if (els.length) return Array.from(els); } catch (e) {} } return []; };
      const rows = q(${JSON.stringify(SELECTORS.legendValues.strategies)});
      return rows.map((r) => ({ text: (r.textContent || '').replace(/\\s+/g, ' ').trim() })).filter((r) => r.text);
    })()`;
    return this.driver.evaluate<LegendLine[]>(expr);
  }

  /** Click the first matching element for a selector def, in-page. */
  private async clickSelector(def: SelectorDef): Promise<boolean> {
    const expr = `((sels) => {
      for (const s of sels) {
        try {
          const el = document.querySelector(s);
          if (el) { if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); el.click(); return true; }
        } catch (e) {}
      }
      return false;
    })(${JSON.stringify(def.strategies)})`;
    return this.driver.evaluate<boolean>(expr);
  }

  /** Focus the first matching element for a selector def, in-page. */
  private async focusSelector(def: SelectorDef): Promise<boolean> {
    const expr = `((sels) => {
      for (const s of sels) {
        try { const el = document.querySelector(s); if (el && el.focus) { el.focus(); return true; } } catch (e) {}
      }
      return false;
    })(${JSON.stringify(def.strategies)})`;
    return this.driver.evaluate<boolean>(expr);
  }

  /** Give keyboard focus to the chart surface. */
  async focusChart(): Promise<void> {
    const clicked = await this.clickSelector(SELECTORS.chartCanvas);
    if (!clicked) {
      const vp = await this.driver.viewport();
      await this.driver.clickAt(Math.round(vp.width / 2), Math.round(vp.height / 2));
    }
  }

  /**
   * Change the active symbol via the symbol-search dialog.
   * Returns the resulting chart state for verification.
   */
  async setSymbol(symbol: string): Promise<{ requested: string; state: ChartState }> {
    const requested = symbol.trim().toUpperCase();
    if (!requested) throw new GlasstapeError("INVALID_INPUT", "Symbol must not be empty.");

    const opened = await this.clickSelector(SELECTORS.symbolSearchButton);
    if (!opened) {
      throw new GlasstapeError("SELECTOR_NOT_FOUND", "Could not open the symbol search.", {
        hint: "TradingView's search button may have changed. Run `glasstape doctor` and update src/tv/selectors.ts.",
      });
    }
    await this.delay(350);
    await this.focusSelector(SELECTORS.symbolSearchInput);
    await this.delay(120);
    await this.driver.typeText(requested);
    await this.delay(450); // let the result list populate
    await this.driver.pressKey("Enter");
    await this.delay(700);

    const state = await this.getState();
    log.debug(`setSymbol(${requested}) -> legend symbol "${state.symbol}"`);
    return { requested, state };
  }

  /**
   * Change the timeframe by opening the interval dialog and clicking the row
   * whose label matches the requested code.
   */
  async setTimeframe(tf: string): Promise<{ requested: string; matched: boolean; state: ChartState }> {
    const requested = tf.trim();
    if (!requested) throw new GlasstapeError("INVALID_INPUT", "Timeframe must not be empty.");
    const candidates = intervalLabelCandidates(requested);

    const opened = await this.clickSelector(SELECTORS.intervalButton);
    if (!opened) {
      throw new GlasstapeError("SELECTOR_NOT_FOUND", "Could not open the interval menu.", {
        hint: "Run `glasstape doctor` and update the intervalButton selector in src/tv/selectors.ts.",
      });
    }
    await this.delay(300);

    const matched = await this.driver.evaluate<boolean>(`((cands) => {
      const rows = Array.from(document.querySelectorAll('[role="option"], [data-role="menuitem"], [class*="item"]'));
      for (const cand of cands) {
        for (const row of rows) {
          const txt = (row.textContent || '').toLowerCase();
          if (txt && txt.includes(cand)) { row.click(); return true; }
        }
      }
      return false;
    })(${JSON.stringify(candidates)})`);

    if (!matched) {
      // Close the menu we opened so we don't leave the UI in a weird state.
      await this.driver.pressKey("Escape");
    }
    await this.delay(500);
    const state = await this.getState();
    return { requested, matched, state };
  }

  /** Capture a screenshot of the page (or a clip region). */
  async screenshot(opts?: ScreenshotOptions): Promise<string> {
    return this.driver.screenshot(opts);
  }
}
