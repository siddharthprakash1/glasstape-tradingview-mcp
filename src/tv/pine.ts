import type { PageDriver } from "../cdp/types.js";
import { GlasstapeError } from "../util/errors.js";

/**
 * Pine Script editor control (part of the fragile TV layer).
 *
 * The Pine editor is a Monaco instance. Reading the console/errors is DOM-based;
 * writing source uses Monaco's model API when available and fails LOUDLY with an
 * actionable hint when the editor isn't open, rather than silently no-op'ing.
 */

const PINE_SELECTORS = {
  console: [
    '[data-name="pine-console"]',
    ".pine-console",
    '[class*="consoleWidget"]',
    '[class*="bottomWidgetbar"] [class*="content"]',
  ],
  errorMarker: [".squiggly-error", '.monaco-editor [class*="error"]'],
};

export interface PineSetResult {
  ok: boolean;
  method: "monaco" | "none";
  detail?: string;
}

export interface PineConsole {
  lines: string[];
}

export class PineController {
  constructor(private readonly driver: PageDriver) {}

  /** Set the Pine editor source via Monaco's model API. */
  async setSource(source: string): Promise<PineSetResult> {
    const expr = `((src) => {
      try {
        if (window.monaco && window.monaco.editor && typeof window.monaco.editor.getModels === 'function') {
          const models = window.monaco.editor.getModels();
          if (models && models.length) {
            // Prefer a model that looks like Pine; fall back to the first.
            const model = models.find((m) => /pine|study|strategy/i.test((m.uri && m.uri.path) || '')) || models[0];
            model.setValue(src);
            return { ok: true, method: 'monaco' };
          }
          return { ok: false, method: 'none', detail: 'no-monaco-models' };
        }
        return { ok: false, method: 'none', detail: 'monaco-unavailable' };
      } catch (e) { return { ok: false, method: 'none', detail: String(e) }; }
    })(${JSON.stringify(source)})`;

    const result = await this.driver.evaluate<PineSetResult>(expr);
    if (!result.ok) {
      throw new GlasstapeError("UNSUPPORTED", "Could not write Pine source.", {
        hint:
          "Open the Pine Editor in TradingView (bottom panel) so the Monaco editor is mounted, then retry. " +
          `(detail: ${result.detail ?? "unknown"})`,
      });
    }
    return result;
  }

  /** Read the Pine console output lines. */
  async getConsole(): Promise<PineConsole> {
    const expr = `(() => {
      const q = (sels) => { for (const s of sels) { try { const el = document.querySelector(s); if (el) return el; } catch (e) {} } return null; };
      const el = q(${JSON.stringify(PINE_SELECTORS.console)});
      if (!el) return { lines: [] };
      const text = (el.innerText || el.textContent || '').trim();
      return { lines: text ? text.split('\\n').map((l) => l.trim()).filter(Boolean) : [] };
    })()`;
    return this.driver.evaluate<PineConsole>(expr);
  }

  /** Read compile error markers shown in the editor gutter, if any. */
  async getErrors(): Promise<string[]> {
    const expr = `(() => {
      const out = [];
      try {
        document.querySelectorAll(${JSON.stringify(PINE_SELECTORS.errorMarker.join(", "))}).forEach((el) => {
          const t = (el.getAttribute('title') || el.textContent || '').trim();
          if (t) out.push(t);
        });
      } catch (e) {}
      return out;
    })()`;
    return this.driver.evaluate<string[]>(expr);
  }
}
