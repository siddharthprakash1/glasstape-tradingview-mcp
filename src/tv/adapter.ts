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
      const docTitle = document.title || '';
      // The document title is the cleanest source of the ticker (e.g. "AAPL 293.08 …").
      const m = docTitle.match(/^\\s*([A-Za-z0-9:._-]{1,20})/);
      const symFromTitle = m ? m[1] : null;
      const symFromLegend = titleEl ? (titleEl.textContent || '').replace(/\\s+/g, ' ').trim() : null;
      return {
        symbol: symFromTitle || symFromLegend || null,
        timeframe: intervalEl ? (intervalEl.textContent || '').replace(/\\s+/g, ' ').trim() : null,
        title: docTitle,
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

  /**
   * Scan the open menu/dialog for a row whose text / aria-label / title matches
   * any candidate (case-insensitive) and click the first hit.
   */
  private async clickRowMatching(candidates: string[]): Promise<boolean> {
    return this.driver.evaluate<boolean>(`((cands) => {
      const rows = Array.from(document.querySelectorAll('[role="option"],[role="menuitem"],[role="row"],[data-role="menuitem"],button,[class*="item"]'));
      const norm = (s) => (s || '').toLowerCase();
      for (const cand of cands) {
        if (!cand) continue;
        for (const row of rows) {
          const hay = norm(row.textContent) + ' ' + norm(row.getAttribute && row.getAttribute('aria-label')) + ' ' + norm(row.getAttribute && row.getAttribute('title'));
          if (hay.includes(cand)) { row.click(); return true; }
        }
      }
      return false;
    })(${JSON.stringify(candidates.map((c) => c.toLowerCase()))})`);
  }

  /** Add an indicator by name (e.g. "RSI", "MACD", "Bollinger Bands"). */
  async addIndicator(name: string): Promise<{ requested: string }> {
    const requested = name.trim();
    if (!requested) throw new GlasstapeError("INVALID_INPUT", "Indicator name must not be empty.");
    const opened = await this.clickSelector(SELECTORS.indicatorsButton);
    if (!opened) {
      throw new GlasstapeError("SELECTOR_NOT_FOUND", "Could not open the Indicators dialog.", {
        hint: "Run `glasstape doctor` and update indicatorsButton in src/tv/selectors.ts.",
      });
    }
    await this.delay(450);
    await this.focusSelector(SELECTORS.dialogSearchInput);
    await this.delay(120);
    await this.driver.typeText(requested);
    await this.delay(550);
    await this.driver.pressKey("Enter"); // add the top result
    await this.delay(350);
    await this.driver.pressKey("Escape"); // close the dialog
    log.debug(`addIndicator(${requested})`);
    return { requested };
  }

  /** Change the chart type (candles, bars, line, area, "heikin ashi", …). */
  async setChartType(type: string): Promise<{ requested: string; matched: boolean }> {
    const requested = type.trim();
    if (!requested) throw new GlasstapeError("INVALID_INPUT", "Chart type must not be empty.");
    const opened = await this.clickSelector(SELECTORS.chartTypeButton);
    if (!opened) {
      throw new GlasstapeError("SELECTOR_NOT_FOUND", "Could not open the chart-type menu.", {
        hint: "Run `glasstape doctor` and update chartTypeButton in src/tv/selectors.ts.",
      });
    }
    await this.delay(300);
    const matched = await this.clickRowMatching([requested]);
    if (!matched) await this.driver.pressKey("Escape");
    await this.delay(300);
    return { requested, matched };
  }

  /** Switch the multi-pane layout (e.g. "2", "2x2", "3"). Best-effort. */
  async setLayout(spec: string): Promise<{ requested: string; matched: boolean }> {
    const requested = spec.trim();
    if (!requested) throw new GlasstapeError("INVALID_INPUT", "Layout must not be empty.");
    const opened = await this.clickSelector(SELECTORS.layoutButton);
    if (!opened) {
      throw new GlasstapeError("SELECTOR_NOT_FOUND", "Could not open the layout picker.", {
        hint: "Run `glasstape doctor` and update layoutButton in src/tv/selectors.ts.",
      });
    }
    await this.delay(300);
    const matched = await this.clickRowMatching([requested]);
    if (!matched) await this.driver.pressKey("Escape");
    await this.delay(400);
    return { requested, matched };
  }

  /** Open the create-alert dialog. Best-effort (configuring the alert is manual). */
  async createAlert(): Promise<{ opened: boolean }> {
    const opened = await this.clickSelector(SELECTORS.alertButton);
    if (!opened) {
      throw new GlasstapeError("SELECTOR_NOT_FOUND", "Could not open the alert dialog.", {
        hint: "Run `glasstape doctor` and update alertButton in src/tv/selectors.ts.",
      });
    }
    await this.delay(400);
    return { opened: true };
  }

  /** Control Bar Replay. action: start | step | play | stop. Best-effort. */
  async replay(action: "start" | "step" | "play" | "stop"): Promise<{ action: string; ok: boolean }> {
    if (action === "start" || action === "stop") {
      const ok = await this.clickSelector(SELECTORS.replayButton); // toggles replay mode
      await this.delay(600);
      return { action, ok };
    }
    const candidates = action === "step" ? ["step forward", "forward", "next bar"] : ["play", "autoplay"];
    const ok = await this.clickRowMatching(candidates);
    await this.delay(300);
    return { action, ok };
  }

  /** Add a drawing via TradingView's keyboard shortcut + placement. Best-effort. */
  async addDrawing(kind: "horizontal" | "trend"): Promise<{ kind: string }> {
    const vp = await this.driver.viewport();
    const cx = Math.round(vp.width / 2);
    const cy = Math.round(vp.height / 2);
    await this.focusChart();
    await this.delay(150);
    if (kind === "horizontal") {
      await this.driver.pressShortcut("h", { alt: true }); // Alt+H: horizontal line tool
      await this.delay(250);
      await this.driver.clickAt(cx, cy);
    } else {
      await this.driver.pressShortcut("t", { alt: true }); // Alt+T: trend line tool
      await this.delay(250);
      await this.driver.drag(cx - 160, cy + 40, cx + 160, cy - 60);
    }
    await this.delay(300);
    return { kind };
  }

  /** Capture a screenshot of the page (or a clip region). */
  async screenshot(opts?: ScreenshotOptions): Promise<string> {
    return this.driver.screenshot(opts);
  }
}
