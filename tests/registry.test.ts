import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { assertUniqueNames } from "../src/mcp/registry.js";
import { allTools } from "../src/domains/index.js";

describe("assertUniqueNames", () => {
  it("passes for unique names", () => {
    expect(() => assertUniqueNames([{ name: "a" }, { name: "b" }])).not.toThrow();
  });
  it("throws on a duplicate", () => {
    expect(() => assertUniqueNames([{ name: "a" }, { name: "a" }])).toThrow(/Duplicate/);
  });
});

describe("allTools", () => {
  it("has unique snake_case names", () => {
    const names = allTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("every tool produces a valid object JSON schema and has a description", () => {
    for (const t of allTools) {
      expect(t.description.length).toBeGreaterThan(10);
      const schema = zodToJsonSchema(z.object(t.input)) as { type?: string };
      expect(schema.type).toBe("object");
    }
  });

  it("exposes the core capabilities", () => {
    const names = allTools.map((t) => t.name);
    for (const expected of ["health", "get_chart_state", "set_symbol", "set_timeframe", "screenshot"]) {
      expect(names).toContain(expected);
    }
  });
});
