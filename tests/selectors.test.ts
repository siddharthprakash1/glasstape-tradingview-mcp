import { describe, expect, it } from "vitest";
import { SELECTORS, firstMatchExpr, selfTestExpr } from "../src/tv/selectors.js";

describe("SELECTORS registry", () => {
  it("every entry has a matching key and at least one strategy", () => {
    for (const [key, def] of Object.entries(SELECTORS)) {
      expect(def.key).toBe(key);
      expect(def.strategies.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });
});

describe("firstMatchExpr", () => {
  it("embeds the strategies and is syntactically valid JS", () => {
    const expr = firstMatchExpr(["a", "b.c"]);
    expect(expr).toContain('"a"');
    expect(expr).toContain('"b.c"');
    // Should be a parseable expression (wrap so a bare value is legal).
    expect(() => new Function(`return (${expr.replace("document.querySelector", "(()=>null)")});`)).not.toThrow();
  });
});

describe("selfTestExpr", () => {
  it("references every selector key", () => {
    const expr = selfTestExpr();
    for (const key of Object.keys(SELECTORS)) {
      expect(expr).toContain(key);
    }
  });
});
