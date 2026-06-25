import { describe, expect, it } from "vitest";
import { intervalLabelCandidates } from "../src/tv/intervals.js";

describe("intervalLabelCandidates", () => {
  it("maps canonical minute codes", () => {
    expect(intervalLabelCandidates("15")).toEqual(["15 minute", "15m"]);
    expect(intervalLabelCandidates("1")).toEqual(["1 minute", "1m"]);
  });

  it("maps numeric hour codes to hour labels", () => {
    expect(intervalLabelCandidates("60")).toEqual(["1 hour"]);
    expect(intervalLabelCandidates("240")).toEqual(["4 hour"]);
  });

  it("parses suffix hour forms case-insensitively", () => {
    expect(intervalLabelCandidates("4H")).toEqual(["4 hour"]);
    expect(intervalLabelCandidates("2h")).toEqual(["2 hour"]);
  });

  it("maps day/week/month", () => {
    expect(intervalLabelCandidates("D")).toEqual(["1 day", "day"]);
    expect(intervalLabelCandidates("1D")).toEqual(["1 day", "day"]);
    expect(intervalLabelCandidates("W")).toEqual(["1 week", "week"]);
    expect(intervalLabelCandidates("1mo")).toEqual(["1 month", "month"]);
  });

  it("disambiguates minutes vs month by unit, not just the letter m", () => {
    // bare-number minutes
    expect(intervalLabelCandidates("90")).toEqual(["90 minute", "90m"]);
    // explicit month
    expect(intervalLabelCandidates("3mo")).toEqual(["3 month", "month"]);
  });

  it("returns empty for blank input", () => {
    expect(intervalLabelCandidates("   ")).toEqual([]);
  });

  it("falls back to the raw token for unknown input", () => {
    expect(intervalLabelCandidates("weird")).toEqual(["weird"]);
  });
});
