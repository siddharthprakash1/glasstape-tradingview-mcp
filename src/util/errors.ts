/**
 * Typed errors for glasstape.
 *
 * Every failure that crosses a layer boundary becomes a {@link GlasstapeError}
 * carrying a machine-readable `code` and a human `hint`. The MCP and CLI
 * boundaries turn these into actionable messages ("TradingView may have
 * changed — run `glasstape doctor`") instead of cryptic stack traces.
 */

export type ErrorCode =
  | "CDP_NOT_CONNECTED"
  | "CDP_CONNECT_FAILED"
  | "TV_TARGET_NOT_FOUND"
  | "TV_NOT_READY"
  | "SELECTOR_NOT_FOUND"
  | "EVAL_FAILED"
  | "TIMEOUT"
  | "INVALID_INPUT"
  | "TOOL_NOT_FOUND"
  | "UNSUPPORTED";

export class GlasstapeError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;
  override readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, opts?: { hint?: string; cause?: unknown }) {
    super(message);
    this.name = "GlasstapeError";
    this.code = code;
    this.hint = opts?.hint;
    this.cause = opts?.cause;
    Object.setPrototypeOf(this, GlasstapeError.prototype);
  }

  /** A single-line, user-facing description including the hint when present. */
  toUserString(): string {
    return this.hint ? `${this.message} — ${this.hint}` : this.message;
  }
}

export function isGlasstapeError(e: unknown): e is GlasstapeError {
  return e instanceof GlasstapeError;
}

/** Normalize any thrown value into a GlasstapeError. */
export function toGlasstapeError(e: unknown, fallbackCode: ErrorCode = "EVAL_FAILED"): GlasstapeError {
  if (isGlasstapeError(e)) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new GlasstapeError(fallbackCode, message, { cause: e });
}
