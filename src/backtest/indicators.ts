/** Pure technical indicators. Each returns an array aligned to the input, with
 *  `undefined` for warmup bars where the value isn't defined yet. */

export function sma(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(values.length).fill(undefined);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(values.length).fill(undefined);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  // Seed with the SMA of the first `period` values.
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(closes.length).fill(undefined);
  if (period <= 0 || closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    const g = diff >= 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Highest value over the trailing `period` bars (inclusive). */
export function highest(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(values.length).fill(undefined);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, values[j]!);
    out[i] = m;
  }
  return out;
}

/** Lowest value over the trailing `period` bars (inclusive). */
export function lowest(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(values.length).fill(undefined);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, values[j]!);
    out[i] = m;
  }
  return out;
}

/** Rolling population standard deviation over `period` bars. */
export function stddev(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(values.length).fill(undefined);
  const means = sma(values, period);
  for (let i = period - 1; i < values.length; i++) {
    const mean = means[i]!;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (values[j]! - mean) ** 2;
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}

export interface Bands {
  middle: Array<number | undefined>;
  upper: Array<number | undefined>;
  lower: Array<number | undefined>;
}

/** Bollinger Bands: SMA(period) ± mult · stddev(period). */
export function bollinger(values: number[], period: number, mult: number): Bands {
  const middle = sma(values, period);
  const sd = stddev(values, period);
  const upper = middle.map((m, i) => (m !== undefined && sd[i] !== undefined ? m + mult * sd[i]! : undefined));
  const lower = middle.map((m, i) => (m !== undefined && sd[i] !== undefined ? m - mult * sd[i]! : undefined));
  return { middle, upper, lower };
}

export interface Macd {
  macd: Array<number | undefined>;
  signal: Array<number | undefined>;
  histogram: Array<number | undefined>;
}

/** MACD line = EMA(fast) − EMA(slow); signal = EMA(signalPeriod) of the MACD line. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const line = values.map((_, i) =>
    emaFast[i] !== undefined && emaSlow[i] !== undefined ? emaFast[i]! - emaSlow[i]! : undefined,
  );
  // Signal = EMA of the defined portion of the MACD line.
  const firstDefined = line.findIndex((v) => v !== undefined);
  const signal: Array<number | undefined> = new Array(values.length).fill(undefined);
  if (firstDefined >= 0) {
    const defined = line.slice(firstDefined).map((v) => v as number);
    const sig = ema(defined, signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[firstDefined + i] = sig[i];
  }
  const histogram = line.map((v, i) => (v !== undefined && signal[i] !== undefined ? v - signal[i]! : undefined));
  return { macd: line, signal, histogram };
}

/** Rate of change over `period` bars, in percent. */
export function roc(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(values.length).fill(undefined);
  for (let i = period; i < values.length; i++) {
    const prev = values[i - period]!;
    if (prev !== 0) out[i] = ((values[i]! - prev) / prev) * 100;
  }
  return out;
}
