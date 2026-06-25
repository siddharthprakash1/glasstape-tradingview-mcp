/**
 * The single source of TradingView DOM knowledge — the fragile layer, quarantined.
 *
 * TradingView ships an obfuscated, frequently-changing DOM. Instead of one
 * brittle selector per element, each hook carries an ORDERED list of strategies:
 * stable `data-name`/`aria` hooks first, structural/class fallbacks last. The
 * first strategy that matches wins, and `glasstape doctor` reports which hooks
 * still resolve so breakage is visible and fixable in ONE file.
 *
 * When a TradingView update breaks something, this is the only file to touch.
 */

export interface SelectorDef {
  key: string;
  description: string;
  /** Ordered CSS selector strategies; first match wins. */
  strategies: string[];
}

export const SELECTORS = {
  chartCanvas: {
    key: "chartCanvas",
    description: "Main chart drawing surface (used to focus the chart).",
    strategies: [
      'canvas[data-name="pane-canvas"]',
      ".chart-container canvas",
      'table.chart-markup-table canvas',
      ".chart-gui-wrapper canvas",
    ],
  },
  symbolSearchButton: {
    key: "symbolSearchButton",
    description: "Header button that opens the symbol search dialog.",
    strategies: [
      '#header-toolbar-symbol-search',
      '[data-name="symbol-search-button"]',
      'button[aria-label*="Symbol Search" i]',
    ],
  },
  symbolSearchInput: {
    key: "symbolSearchInput",
    description: "Text input inside the open symbol search dialog.",
    strategies: [
      'input[data-role="search"]',
      'input[aria-label*="symbol" i]',
      '.search-ZXzPWcCf input',
      'div[role="dialog"] input[type="text"]',
    ],
  },
  legendTitle: {
    key: "legendTitle",
    description: "Current symbol as shown in the chart legend.",
    strategies: [
      '[data-name="legend-source-title"]',
      '.legend-source-title',
      'div[class*="legendMainSourceWrapper"] [class*="title"]',
    ],
  },
  legendValues: {
    key: "legendValues",
    description: "OHLC / indicator value row in the chart legend.",
    strategies: [
      '[data-name="legend-source-item"]',
      '.legend-source-item',
      'div[class*="legendMainSourceWrapper"]',
    ],
  },
  intervalButton: {
    key: "intervalButton",
    description: "Toolbar control showing the current timeframe/interval.",
    strategies: [
      '#header-toolbar-intervals [aria-pressed="true"]',
      '[data-name="time-intervals-dialog-button"]',
      '#header-toolbar-intervals button',
    ],
  },
  replayButton: {
    key: "replayButton",
    description: "Bar Replay toggle in the toolbar.",
    strategies: [
      '#header-toolbar-replay',
      '[data-name="replay"]',
      'button[aria-label*="Replay" i]',
    ],
  },
  alertButton: {
    key: "alertButton",
    description: "Create-alert control.",
    strategies: [
      '#header-toolbar-alerts',
      '[data-name="alerts"]',
      'button[aria-label*="Alert" i]',
    ],
  },
} satisfies Record<string, SelectorDef>;

export type SelectorKey = keyof typeof SELECTORS;

/**
 * Build a JS expression (string) that returns the first matching element for an
 * ordered strategy list, or null. Intended to be embedded inside larger
 * injected scripts.
 */
export function firstMatchExpr(strategies: string[]): string {
  return `((sels) => { for (const s of sels) { try { const el = document.querySelector(s); if (el) return el; } catch (e) {} } return null; })(${JSON.stringify(
    strategies,
  )})`;
}

/**
 * Build a JS expression that returns, for every selector definition, whether at
 * least one strategy currently resolves. Used by the doctor / health self-test.
 */
export function selfTestExpr(): string {
  const defs = Object.values(SELECTORS).map((d) => ({ key: d.key, strategies: d.strategies }));
  return `((defs) => {
    const out = {};
    for (const d of defs) {
      let matched = null;
      for (let i = 0; i < d.strategies.length; i++) {
        try { if (document.querySelector(d.strategies[i])) { matched = i; break; } } catch (e) {}
      }
      out[d.key] = { ok: matched !== null, strategyIndex: matched };
    }
    return out;
  })(${JSON.stringify(defs)})`;
}

export interface SelfTestEntry {
  ok: boolean;
  /** Index of the strategy that matched, or null if none did. */
  strategyIndex: number | null;
}

export type SelfTestReport = Record<string, SelfTestEntry>;
