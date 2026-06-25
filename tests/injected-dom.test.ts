// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { firstMatchExpr, selfTestExpr } from "../src/tv/selectors.js";

/** Evaluate an injected expression against the jsdom `document` (global). */
function run<T>(expr: string): T {
  // eslint-disable-next-line no-eval
  return eval(expr) as T;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("firstMatchExpr evaluated against a real DOM", () => {
  it("returns the first matching element in strategy order", () => {
    document.body.innerHTML = '<div id="b"></div>';
    const el = run<Element | null>(firstMatchExpr(["#a", "#b"]));
    expect(el).not.toBeNull();
    expect((el as Element).id).toBe("b");
  });

  it("returns null when no strategy matches", () => {
    document.body.innerHTML = '<div id="x"></div>';
    expect(run(firstMatchExpr(["#a", ".none"]))).toBeNull();
  });

  it("prefers the earliest element when one selector matches several", () => {
    document.body.innerHTML = '<div class="z" id="first"></div><div class="z" id="second"></div>';
    expect(run<Element>(firstMatchExpr([".z"])).id).toBe("first");
  });

  it("tolerates a malformed selector and continues to the next strategy", () => {
    document.body.innerHTML = '<div id="ok"></div>';
    expect(run<Element>(firstMatchExpr(["::::bad", "#ok"])).id).toBe("ok");
  });
});

describe("selfTestExpr evaluated against a real DOM", () => {
  it("reports the matched strategy index, or false when absent", () => {
    document.body.innerHTML = `
      <canvas data-name="pane-canvas"></canvas>
      <div class="legend-source-title">BTCUSD</div>
    `;
    const report = run<Record<string, { ok: boolean; strategyIndex: number | null }>>(selfTestExpr());

    // chartCanvas: first strategy (canvas[data-name="pane-canvas"]) matches → index 0
    expect(report.chartCanvas.ok).toBe(true);
    expect(report.chartCanvas.strategyIndex).toBe(0);

    // legendTitle: only the SECOND strategy (.legend-source-title) is present → index 1
    expect(report.legendTitle.ok).toBe(true);
    expect(report.legendTitle.strategyIndex).toBe(1);

    // symbolSearchButton: nothing present → not ok
    expect(report.symbolSearchButton.ok).toBe(false);
    expect(report.symbolSearchButton.strategyIndex).toBeNull();
  });
});
