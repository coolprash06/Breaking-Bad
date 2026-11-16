/**
 * Monte Carlo ensemble forecast (F3) with messy-data handling (F7).
 *
 * Each member samples:
 *  - learned parameters within their standard errors,
 *  - future usage (recent usage x member-level uncertainty x daily noise, minus any scenario cut),
 *  - future rain from last year's same-season climatology,
 *  - process noise learned from the residuals.
 * The starting level carries extra uncertainty when the sensor has been silent,
 * and the noise is inflated by recent gap ratio, so the band WIDENS with missing data.
 */
import type { Observation, UsageCategory, WaterSource } from "@/lib/types";
import { USAGE_CATEGORIES } from "@/lib/types";
import { GROUNDWATER_RAIN_LAG_DAYS } from "@/config/thresholds";
import { rngFor, hashString, type Rng } from "@/lib/sim/prng";
import { expectedDelta, PARAM_KEYS, type LearnedModel, type ParamKey } from "./calibrate";
import type { DailyFeatures } from "./features";

export const HORIZON_DAYS = 120;
export const DEFAULT_MEMBERS = 500;
const RECENT_USAGE_DAYS = 5;
const MANUAL_MEASUREMENT_SD = 0.02;

export type UsageCut = Partial<Record<UsageCategory, number>>;

export interface BandPoint {
  /** Days ahead of asOf. */
  day: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface StartState {
  level: number;
  sd: number;
  kind: "sensor" | "manual" | "none";
  /** Index of the reading/measurement used. */
  fromIdx: number;
  daysSince: number;
}

export interface EnsembleResult {
  start: StartState;
  band: BandPoint[];
  /** Failure day per member (Infinity if not within horizon), sorted. */
  failureDays: number[];
  ttf: { p10: number | null; p50: number | null; p90: number | null };
  probFail: number;
  widening: { daysSinceReading: number; gapRatio30: number; factor: number };
  recentUsage: Record<UsageCategory, number>;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function finiteOrNull(x: number): number | null {
  return Number.isFinite(x) ? Math.round(x) : null;
}

export function meanRecent(arr: number[], endIdx: number, days: number): number {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, endIdx - days + 1); i <= endIdx; i++) {
    s += arr[i];
    n++;
  }
  return n ? s / n : 0;
}

/** Best estimate of today's level: recent sensor readings (or a newer manual measurement), projected to asOf. */
export function estimateStart(
  readings: (number | null)[],
  observations: Observation[],
  dateToIdx: (d: string) => number,
  f: DailyFeatures,
  m: LearnedModel,
  asOfIdx: number,
): StartState {
  const project = (from: number) => {
    let x = 0;
    for (let t = from + 1; t <= asOfIdx; t++) {
      x += expectedDelta(m, {
        rechargeRain: f.rechargeRain[t],
        pet: f.pet[t],
        usage: { fetch: f.usage.fetch[t], spot: f.usage.spot[t], pump: f.usage.pump[t] },
      });
    }
    return x;
  };
  const driftSe = (g: number) =>
    Math.sqrt(m.processSd ** 2 * g + (g * (m.se.drift + 0.002)) ** 2);

  // Up to 3 most recent sensor readings within 10 days.
  const recent: number[] = [];
  for (let i = asOfIdx; i >= 0 && recent.length < 3 && asOfIdx - i <= 10; i--) {
    if (readings[i] !== null) recent.push(i);
  }
  let lastSensor = -1;
  for (let i = asOfIdx; i >= 0; i--) if (readings[i] !== null) { lastSensor = i; break; }

  const lastObs = [...observations].reverse().find((o) => dateToIdx(o.date) <= asOfIdx);
  const obsIdx = lastObs ? dateToIdx(lastObs.date) : -1;

  if (recent.length > 0 && recent[0] >= obsIdx) {
    const ests = recent.map((i) => (readings[i] as number) + project(i));
    const level = ests.reduce((a, b) => a + b, 0) / ests.length;
    const g = asOfIdx - recent[0];
    const sd = Math.sqrt(m.sensorSd ** 2 / recent.length + driftSe(g) ** 2 + 1e-6);
    return { level, sd, kind: "sensor", fromIdx: recent[0], daysSince: g };
  }
  if (lastObs && obsIdx > lastSensor) {
    const g = asOfIdx - obsIdx;
    return {
      level: lastObs.levelM + project(obsIdx),
      sd: Math.sqrt(MANUAL_MEASUREMENT_SD ** 2 + driftSe(g) ** 2),
      kind: "manual",
      fromIdx: obsIdx,
      daysSince: g,
    };
  }
  if (lastSensor >= 0) {
    const g = asOfIdx - lastSensor;
    return {
      level: (readings[lastSensor] as number) + project(lastSensor),
      sd: Math.sqrt(m.sensorSd ** 2 + driftSe(g) ** 2),
      kind: "sensor",
      fromIdx: lastSensor,
      daysSince: g,
    };
  }
  return { level: 0, sd: 1, kind: "none", fromIdx: -1, daysSince: Infinity };
}

interface RainClimatology {
  pWet: number;
  wet: number[];
}

/** Last year's same-season (+-15 days) wet-day probability and amounts, per forecast day. */
function buildClimatology(rain: number[], asOfIdx: number, H: number): RainClimatology[] {
  const out: RainClimatology[] = [];
  for (let d = 0; d <= H; d++) {
    const histIdx = asOfIdx + d - 365;
    const lo = Math.max(0, histIdx - 15);
    const hi = Math.min(rain.length - 1, histIdx + 15);
    const wet: number[] = [];
    for (let i = lo; i <= hi; i++) if (rain[i] > 0) wet.push(rain[i]);
    out.push({ pWet: hi >= lo ? wet.length / (hi - lo + 1) : 0, wet });
  }
  return out;
}

/**
 * Relative sd of a sum of independent category draws, each with relative sd 1:
 * sqrt(sum a_i^2) / sum a_i  (1 when one category dominates, smaller when mixed).
 */
function dailyUseNoiseShare(a: number, b: number, c: number): number {
  const s = a + b + c;
  return s > 0 ? Math.sqrt(a * a + b * b + c * c) / s : 0;
}

function sampleRain(c: RainClimatology, rng: Rng): number {
  if (!c.wet.length || !rng.bernoulli(c.pWet)) return 0;
  return c.wet[Math.floor(rng.next() * c.wet.length)];
}

export interface EnsembleInput {
  source: WaterSource;
  model: LearnedModel;
  features: DailyFeatures;
  readings: (number | null)[];
  observations: Observation[];
  dateToIdx: (d: string) => number;
  asOfIdx: number;
  asOf: string;
  usageCut?: UsageCut;
  members?: number;
  horizon?: number;
  /** Skip the per-day quantile band (persistence checks only need failure days). */
  skipBand?: boolean;
}

export function runEnsemble(inp: EnsembleInput): EnsembleResult {
  const { source, model: m, features: f, asOfIdx } = inp;
  const members = inp.members ?? DEFAULT_MEMBERS;
  const H = inp.horizon ?? HORIZON_DAYS;
  const cutKey = USAGE_CATEGORIES.map((c) => inp.usageCut?.[c] ?? 0).join(",");
  const rng = rngFor(hashString(inp.asOf), `ens:${source.id}:${cutKey}:${members}`);

  const start = estimateStart(inp.readings, inp.observations, inp.dateToIdx, f, m, asOfIdx);

  // Missing-data widening (F7).
  let gaps30 = 0;
  for (let i = Math.max(0, asOfIdx - 29); i <= asOfIdx; i++) if (inp.readings[i] === null) gaps30++;
  const gapRatio30 = gaps30 / 30;
  const daysSinceReading = start.daysSince;
  const factor = 1 + 2 * gapRatio30 + Math.min(2, (Number.isFinite(daysSinceReading) ? daysSinceReading : 30) / 7);

  const recentUsage = {} as Record<UsageCategory, number>;
  for (const c of USAGE_CATEGORIES) {
    recentUsage[c] = meanRecent(f.usage[c], asOfIdx, RECENT_USAGE_DAYS) * (1 - (inp.usageCut?.[c] ?? 0));
  }

  const clim = buildClimatology(f.rain, asOfIdx, H);
  const petHist: number[] = [];
  for (let d = 0; d <= H; d++) petHist.push(f.pet[Math.max(0, asOfIdx + d - 365)] ?? f.pet[asOfIdx]);
  const kLag = Math.exp(-1 / GROUNDWATER_RAIN_LAG_DAYS);
  const lagState0 = f.rechargeRain[asOfIdx] ?? 0;
  const paths: Float64Array[] = Array.from({ length: H + 1 }, () => new Float64Array(members));
  const failureDays: number[] = [];

  const noiseSd = m.processSd * factor;
  const cap = source.capacityM;
  const failAt = source.failureLevelM;
  for (let k = 0; k < members; k++) {
    // Sample this member's parameters within their learned uncertainty.
    const coef = {} as Record<ParamKey, number>;
    for (const p of PARAM_KEYS) {
      const v = m.coef[p] + rng.normal(0, m.se[p] * factor);
      coef[p] = p === "drift" ? v : Math.max(0, v);
    }
    // Member-level usage scenario (how far future use differs from recent use).
    const uf = recentUsage.fetch * coef.fetch * rng.lognormalFactor(0.15);
    const us = recentUsage.spot * coef.spot * rng.lognormalFactor(0.15);
    const up = recentUsage.pump * coef.pump * rng.lognormalFactor(0.15);

    let level = Math.max(0, start.level + rng.normal(0, start.sd));
    let lag = lagState0;
    let failed = level <= failAt ? 0 : Infinity;
    paths[0][k] = level;

    for (let d = 1; d <= H; d++) {
      const rain = sampleRain(clim[d], rng);
      lag = lag * kLag + rain * (1 - kLag);
      const pet = petHist[d];
      // One daily usage fluctuation (sum of the three categories' independent day-to-day noise).
      const use = (uf + us + up) * (1 + rng.normal(0, 0.12) * dailyUseNoiseShare(uf, us, up));
      const delta = coef.recharge * (f.lagged ? lag : rain) - coef.evap * pet - use + coef.drift;
      level = level + delta + rng.normal(0, noiseSd);
      level = level > cap ? cap : level < 0 ? 0 : level;
      paths[d][k] = level;
      if (failed === Infinity && level <= failAt) failed = d;
    }
    failureDays.push(failed);
  }

  const band: BandPoint[] = inp.skipBand ? [] : paths.map((col, day) => {
    const s = Array.from(col).sort((a, b) => a - b);
    return { day, p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9) };
  });
  failureDays.sort((a, b) => a - b);
  const q = (p: number) => failureDays[Math.min(members - 1, Math.floor(p * members))];

  return {
    start,
    band,
    failureDays,
    ttf: { p10: finiteOrNull(q(0.1)), p50: finiteOrNull(q(0.5)), p90: finiteOrNull(q(0.9)) },
    probFail: failureDays.filter(Number.isFinite).length / members,
    widening: { daysSinceReading, gapRatio30, factor },
    recentUsage,
  };
}

/**
 * Turn the failure-day distribution into the user-facing estimate:
 * a 2-week window around the median, and the share of members failing inside it.
 * "Likely to fail in 4-6 weeks (72% confident)".
 */
export function failureWindow(r: Pick<EnsembleResult, "failureDays" | "ttf" | "probFail">, horizon = HORIZON_DAYS) {
  const n = r.failureDays.length;
  if (r.ttf.p50 === null) {
    const weeks = Math.floor(horizon / 7);
    return {
      failsWithinHorizon: false as const,
      fromWeeks: weeks,
      toWeeks: null,
      confidence: 1 - r.probFail,
      label: `Not expected to fail within ${weeks} weeks`,
      short: `${weeks}+ weeks`,
    };
  }
  const med = r.ttf.p50;
  const fromWeeks = Math.max(0, Math.round((med - 7) / 7));
  const toWeeks = Math.max(fromWeeks + 1, Math.round((med + 7) / 7));
  const inside = r.failureDays.filter((d) => d >= fromWeeks * 7 && d <= toWeeks * 7).length / n;
  const approx = Math.max(0, Math.round(med / 7));
  return {
    failsWithinHorizon: true as const,
    fromWeeks,
    toWeeks,
    confidence: inside,
    label: `Likely to fail in ${fromWeeks}-${toWeeks} weeks`,
    short: approx <= 0 ? "under 1 week" : `~${approx} week${approx === 1 ? "" : "s"} left`,
  };
}
