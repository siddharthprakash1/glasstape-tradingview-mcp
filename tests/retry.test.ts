import { describe, expect, it, vi } from "vitest";
import { backoffDelay, withRetry } from "../src/util/retry.js";

const noSleep = async () => {};

describe("backoffDelay", () => {
  it("is deterministic given a fixed random source", () => {
    expect(backoffDelay(0, 200, 4000, () => 0)).toBe(100); // exp=200 -> 100 + 0
    expect(backoffDelay(0, 200, 4000, () => 1)).toBe(200); // 100 + 100
    expect(backoffDelay(2, 200, 4000, () => 0)).toBe(400); // exp=800 -> 400
  });

  it("respects the max cap", () => {
    expect(backoffDelay(10, 200, 1000, () => 1)).toBe(1000); // capped exp=1000 -> 500+500
  });
});

describe("withRetry", () => {
  it("returns on first success without sleeping", async () => {
    const fn = vi.fn(async () => "ok");
    const sleep = vi.fn(noSleep);
    await expect(withRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries until success", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new Error("transient");
      return n;
    });
    await expect(withRetry(fn, { attempts: 5, sleep: noSleep, random: () => 0 })).resolves.toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting attempts", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow("always");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops immediately when the error is not retryable", async () => {
    const fn = vi.fn(async () => {
      throw new Error("fatal");
    });
    await expect(
      withRetry(fn, { attempts: 5, sleep: noSleep, retryable: () => false }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
