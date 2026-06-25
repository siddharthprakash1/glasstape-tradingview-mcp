/**
 * Retry with exponential backoff and jitter.
 *
 * `sleep` is injectable so tests can run instantly and deterministically.
 */

export interface RetryOptions {
  /** Total attempts (including the first). Default 3. */
  attempts?: number;
  /** Base delay in ms for the first backoff. Default 200. */
  baseMs?: number;
  /** Cap on any single backoff. Default 4000. */
  maxMs?: number;
  /** Return false to stop retrying a given error. Default: always retry. */
  retryable?: (error: unknown) => boolean;
  /** Injectable delay (testing). Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Deterministic jitter source in [0,1). Default Math.random. */
  random?: () => number;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Compute the backoff (with jitter) for a 0-based attempt index. Exported for testing. */
export function backoffDelay(
  attemptIndex: number,
  baseMs: number,
  maxMs: number,
  random: () => number,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attemptIndex);
  // Full jitter: random value in [exp/2, exp].
  return Math.round(exp / 2 + random() * (exp / 2));
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseMs = options.baseMs ?? 200;
  const maxMs = options.maxMs ?? 4000;
  const retryable = options.retryable ?? (() => true);
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLast = i === attempts - 1;
      if (isLast || !retryable(error)) break;
      await sleep(backoffDelay(i, baseMs, maxMs, random));
    }
  }
  throw lastError;
}
