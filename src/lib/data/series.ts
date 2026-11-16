/** Small helpers over daily series (shared by the UI, the engines and tests). */

/** Days since the last non-null value at or before index `asOfIdx`. null if never. */
export function daysSinceLastReading(values: (number | null)[], asOfIdx = values.length - 1): number | null {
  for (let i = Math.min(asOfIdx, values.length - 1); i >= 0; i--) {
    if (values[i] !== null) return asOfIdx - i;
  }
  return null;
}

/** Number of null days in [from, to] inclusive. */
export function countGapDays(values: (number | null)[], from = 0, to = values.length - 1): number {
  let n = 0;
  for (let i = Math.max(0, from); i <= Math.min(to, values.length - 1); i++) if (values[i] === null) n++;
  return n;
}

/**
 * Exponentially smoothed rain with unit total weight: total recharge is kept,
 * only spread out in time (infiltration delay).
 */
export function laggedRain(rainMm: number[], tauDays: number): number[] {
  const k = Math.exp(-1 / tauDays);
  const out: number[] = [];
  let s = 0;
  for (const r of rainMm) {
    s = s * k + r * (1 - k);
    out.push(s);
  }
  return out;
}
