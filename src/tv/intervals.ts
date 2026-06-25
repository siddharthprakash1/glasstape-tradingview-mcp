/**
 * Pure timeframe normalisation.
 *
 * TradingView's interval menu is labelled in human text ("4 hours", "1 day"),
 * but users pass terse codes ("240", "4H", "D"). This maps a code to the set of
 * lowercase label substrings we can match against menu rows. Kept pure so it is
 * fully unit-tested without a browser.
 */

const MINUTE_LABELS = (n: number): string[] => [`${n} minute`, `${n}m`];
const HOUR_LABELS = (n: number): string[] => [`${n} hour`];

/** Canonical map of well-known interval codes to label candidates. */
const TABLE: Record<string, string[]> = {
  "1": MINUTE_LABELS(1),
  "3": MINUTE_LABELS(3),
  "5": MINUTE_LABELS(5),
  "15": MINUTE_LABELS(15),
  "30": MINUTE_LABELS(30),
  "45": MINUTE_LABELS(45),
  "60": ["1 hour"],
  "120": ["2 hour"],
  "180": ["3 hour"],
  "240": ["4 hour"],
  d: ["1 day", "day"],
  w: ["1 week", "week"],
  mo: ["1 month", "month"],
};

/**
 * Return ordered lowercase label-substring candidates for a timeframe code.
 * Throws nothing — an unknown code yields a best-effort single candidate so the
 * in-page matcher can still try.
 */
export function intervalLabelCandidates(tf: string): string[] {
  const raw = tf.trim().toLowerCase();
  if (!raw) return [];

  // Direct table hit (minutes as numbers, or d/w/mo).
  if (raw in TABLE) return TABLE[raw]!;

  // Suffix forms: 1h/4h, 1d, 1w, 1mo, 90m.
  const m = raw.match(/^(\d+)\s*(m|min|h|hr|hour|d|day|w|week|mo|month)$/);
  if (m) {
    const n = Number.parseInt(m[1]!, 10);
    const unit = m[2]!;
    if (unit.startsWith("m") && unit !== "mo" && unit !== "month") return MINUTE_LABELS(n);
    if (unit === "mo" || unit === "month") return [`${n} month`, "month"];
    if (unit.startsWith("h")) return HOUR_LABELS(n);
    if (unit.startsWith("d")) return [`${n} day`, "day"];
    if (unit.startsWith("w")) return [`${n} week`, "week"];
  }

  // Bare number we don't have a canonical label for → treat as minutes.
  if (/^\d+$/.test(raw)) return MINUTE_LABELS(Number.parseInt(raw, 10));

  return [raw];
}
