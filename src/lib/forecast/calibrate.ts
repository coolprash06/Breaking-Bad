/**
 * LEARNING STEP (the "AI" in the system).
 *
 * For each source we learn, from its own past sensor readings, how the level
 * responds to each driver:
 *
 *   level[j] - level[i] = sum over days t in (i, j] of
 *        recharge * rain[t]
 *      - evap     * PET[t]
 *      - rate_fetch * households[t]
 *      - rate_spot  * animalEq[t]
 *      - rate_pump  * pumpHours[t]
 *      + drift
 *
 * Method: weighted ridge least squares on intervals between consecutive valid
 * readings (so sensor gaps are handled naturally), with
 *  - physical sign constraints (recharge, evaporation and usage rates >= 0),
 *    enforced by an active-set loop,
 *  - robust outlier removal (sensor glitches),
 *  - exclusion of intervals where the source was dry or overflowing.
 *
 * Nothing here is hand-set per source: every coefficient comes from the data.
 */
import type { UsageCategory, WaterSource } from "@/lib/types";
import type { DailyFeatures } from "./features";
import { invert, solve } from "./linalg";

export const PARAM_KEYS = ["recharge", "evap", "fetch", "spot", "pump", "drift"] as const;
export type ParamKey = (typeof PARAM_KEYS)[number];

export interface LearnedModel {
  coef: Record<ParamKey, number>;
  se: Record<ParamKey, number>;
  /** Parameters with no signal in the data (e.g. no pumping ever) are fixed at 0. */
  notIdentified: ParamKey[];
  r2: number;
  nIntervals: number;
  nDaysCovered: number;
  nOutliers: number;
  /**
   * Reading indices the fit rejected as sensor glitches. A glitch spoils both
   * intervals that touch it, so it is the reading shared by two rejected intervals.
   */
  glitchIdx: number[];
  residualSd: number;
  /** Day-to-day unexplained change (m/day), separated from sensor noise. */
  processSd: number;
  /** Sensor measurement noise (m), from residual autocorrelation. */
  sensorSd: number;
  fitFrom: string | null;
  fitTo: string | null;
}

const CONSTRAINED: ParamKey[] = ["recharge", "evap", "fetch", "spot", "pump"];
const MAX_INTERVAL_DAYS = 7;
const RIDGE_LAMBDA = 0.5;

interface Row {
  x: number[]; // in PARAM_KEYS order, already signed (losses negative)
  y: number;
  w: number;
  days: number;
  endIdx: number;
}

/** Feature row for the change over days (i, j]. */
function intervalRow(f: DailyFeatures, i: number, j: number): number[] {
  const s = { recharge: 0, evap: 0, fetch: 0, spot: 0, pump: 0 };
  for (let t = i + 1; t <= j; t++) {
    s.recharge += f.rechargeRain[t];
    s.evap += f.pet[t];
    s.fetch += f.usage.fetch[t];
    s.spot += f.usage.spot[t];
    s.pump += f.usage.pump[t];
  }
  return [s.recharge, -s.evap, -s.fetch, -s.spot, -s.pump, j - i];
}

export function buildRows(
  source: WaterSource,
  readings: (number | null)[],
  f: DailyFeatures,
  upToIdx = readings.length - 1,
): Row[] {
  const rows: Row[] = [];
  const lo = 0.03;
  const hi = source.capacityM - 0.03;
  let prev = -1;
  for (let j = 0; j <= upToIdx; j++) {
    const v = readings[j];
    if (v === null) continue;
    if (prev >= 0) {
      const p = readings[prev] as number;
      const k = j - prev;
      const clipped = p <= lo || v <= lo || p >= hi || v >= hi;
      if (k <= MAX_INTERVAL_DAYS && !clipped) {
        rows.push({ x: intervalRow(f, prev, j), y: v - p, w: 1 / (1 + 0.25 * (k - 1)), days: k, endIdx: j });
      }
    }
    prev = j;
  }
  return rows;
}

interface FitResult {
  beta: number[];
  cov: number[][] | null;
  active: boolean[];
}

/** Weighted ridge LS with an active set: constrained columns that go negative are fixed at 0. */
function constrainedRidge(rows: Row[], usable: boolean[]): FitResult {
  const p = PARAM_KEYS.length;
  const active = [...usable];
  const constrainedIdx = CONSTRAINED.map((k) => PARAM_KEYS.indexOf(k));

  // Column scales (RMS) so ridge treats columns comparably; intercept unpenalised.
  const scale = new Array<number>(p).fill(1);
  for (let c = 0; c < p - 1; c++) {
    let ss = 0;
    for (const r of rows) ss += r.w * r.x[c] * r.x[c];
    scale[c] = Math.sqrt(ss / Math.max(1, rows.length)) || 1;
  }

  for (let iter = 0; iter < p; iter++) {
    const idx = active.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
    const q = idx.length;
    const XtX = Array.from({ length: q }, () => new Array<number>(q).fill(0));
    const Xty = new Array<number>(q).fill(0);
    for (const r of rows) {
      for (let a = 0; a < q; a++) {
        const xa = r.x[idx[a]] / scale[idx[a]];
        Xty[a] += r.w * xa * r.y;
        for (let b = 0; b < q; b++) XtX[a][b] += r.w * xa * (r.x[idx[b]] / scale[idx[b]]);
      }
    }
    for (let a = 0; a < q; a++) if (idx[a] !== p - 1) XtX[a][a] += RIDGE_LAMBDA;

    const sol = solve(XtX, Xty);
    const beta = new Array<number>(p).fill(0);
    if (sol) idx.forEach((c, a) => (beta[c] = sol[a] / scale[c]));

    // Drop the most negative constrained coefficient and refit.
    let worst = -1;
    for (const c of constrainedIdx) {
      if (active[c] && beta[c] < 0 && (worst < 0 || beta[c] < beta[worst])) worst = c;
    }
    if (worst >= 0 && sol) {
      active[worst] = false;
      continue;
    }

    let cov: number[][] | null = null;
    const inv = sol ? invert(XtX) : null;
    if (inv) {
      cov = Array.from({ length: p }, () => new Array<number>(p).fill(0));
      idx.forEach((ci, a) =>
        idx.forEach((cj, b) => {
          cov![ci][cj] = inv[a][b] / (scale[ci] * scale[cj]);
        }),
      );
    }
    return { beta, cov, active };
  }
  return { beta: new Array<number>(p).fill(0), cov: null, active };
}

function residuals(rows: Row[], beta: number[]): number[] {
  return rows.map((r) => r.y - r.x.reduce((s, x, c) => s + x * beta[c], 0));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Readings shared by two rejected intervals; a lone rejected interval flags its end reading. */
function findGlitches(rejected: Row[]): number[] {
  const count = new Map<number, number>();
  for (const r of rejected) {
    for (const i of [r.endIdx - r.days, r.endIdx]) count.set(i, (count.get(i) ?? 0) + 1);
  }
  const out = new Set<number>();
  for (const r of rejected) {
    const a = r.endIdx - r.days;
    if ((count.get(a) ?? 0) >= 2) out.add(a);
    else if ((count.get(r.endIdx) ?? 0) >= 2) out.add(r.endIdx);
    else out.add(r.endIdx);
  }
  return [...out].sort((x, y) => x - y);
}

const EMPTY: Record<ParamKey, number> = { recharge: 0, evap: 0, fetch: 0, spot: 0, pump: 0, drift: 0 };

export function learnParameters(
  source: WaterSource,
  readings: (number | null)[],
  f: DailyFeatures,
  dateAt: (i: number) => string,
  upToIdx = readings.length - 1,
): LearnedModel {
  let rows = buildRows(source, readings, f, upToIdx);
  const p = PARAM_KEYS.length;

  // A driver with (almost) no variation for this source carries no signal.
  const usable = PARAM_KEYS.map((_, c) => c === p - 1 || rows.some((r) => Math.abs(r.x[c]) > 1e-9));

  if (rows.length < 12) {
    return {
      coef: { ...EMPTY }, se: { ...EMPTY }, notIdentified: [...PARAM_KEYS], r2: 0,
      nIntervals: rows.length, nDaysCovered: 0, nOutliers: 0, glitchIdx: [], residualSd: 0.05,
      processSd: 0.01, sensorSd: 0.01, fitFrom: null, fitTo: null,
    };
  }

  // Fit, remove gross outliers (sensor glitches), refit.
  let fit = constrainedRidge(rows, usable);
  const res0 = residuals(rows, fit.beta);
  const madSd = 1.4826 * median(res0.map((r) => Math.abs(r - median(res0))));
  const keep = res0.map((r) => Math.abs(r) <= Math.max(5 * madSd, 1e-4));
  const nOutliers = keep.filter((k) => !k).length;
  const glitchIdx = findGlitches(rows.filter((_, i) => !keep[i]));
  if (nOutliers > 0) {
    rows = rows.filter((_, i) => keep[i]);
    fit = constrainedRidge(rows, usable);
  }

  const res = residuals(rows, fit.beta);
  const wSum = rows.reduce((s, r) => s + r.w, 0);
  const yMean = rows.reduce((s, r) => s + r.w * r.y, 0) / wSum;
  const ssRes = rows.reduce((s, r, i) => s + r.w * res[i] * res[i], 0);
  const ssTot = rows.reduce((s, r) => s + r.w * (r.y - yMean) ** 2, 0);
  const nActive = fit.active.filter(Boolean).length;
  const sigma2 = ssRes / Math.max(1, wSum - nActive);

  // Separate sensor noise from process noise: differenced white sensor noise
  // gives a negative lag-1 autocovariance of -sensorVar between adjacent 1-day intervals.
  const oneDay = rows.map((r, i) => ({ r, e: res[i] })).filter((x) => x.r.days === 1);
  let acf1 = 0;
  let nPairs = 0;
  let var1 = 0;
  for (let i = 0; i < oneDay.length; i++) {
    var1 += oneDay[i].e ** 2;
    if (i > 0 && oneDay[i].r.endIdx - oneDay[i - 1].r.endIdx === 1) {
      acf1 += oneDay[i].e * oneDay[i - 1].e;
      nPairs++;
    }
  }
  var1 /= Math.max(1, oneDay.length);
  acf1 /= Math.max(1, nPairs);
  const sensorVar = Math.min(Math.max(0, -acf1), var1 / 2);
  const processVar = Math.max(var1 - 2 * sensorVar, 1e-6);

  const coef = { ...EMPTY };
  const se = { ...EMPTY };
  const notIdentified: ParamKey[] = [];
  PARAM_KEYS.forEach((k, c) => {
    coef[k] = fit.beta[c];
    se[k] = fit.cov ? Math.sqrt(Math.max(0, fit.cov[c][c] * sigma2)) : 0;
    if (!fit.active[c]) {
      coef[k] = 0;
      se[k] = 0;
      if (!usable[c]) notIdentified.push(k);
    }
  });

  return {
    coef,
    se,
    notIdentified,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
    nIntervals: rows.length,
    nDaysCovered: rows.reduce((s, r) => s + r.days, 0),
    nOutliers,
    glitchIdx,
    residualSd: Math.sqrt(sigma2),
    processSd: Math.sqrt(processVar),
    sensorSd: Math.sqrt(sensorVar),
    fitFrom: dateAt(rows[0].endIdx - rows[0].days),
    fitTo: dateAt(rows[rows.length - 1].endIdx),
  };
}

/** Expected level change on day t under the learned model (no noise). */
export function expectedDelta(
  m: Pick<LearnedModel, "coef">,
  drivers: { rechargeRain: number; pet: number; usage: Record<UsageCategory, number> },
): number {
  const c = m.coef;
  return (
    c.recharge * drivers.rechargeRain -
    c.evap * drivers.pet -
    c.fetch * drivers.usage.fetch -
    c.spot * drivers.usage.spot -
    c.pump * drivers.usage.pump +
    c.drift
  );
}
