/**
 * Independent warning signals (F4: "multiple signals must agree").
 *  1. Level dropping (from the sensor)            + "faster than usual" vs the learned model
 *  2. Rain deficit (from rainfall)
 *  3. Vegetation browning (from NDVI; cloudy scenes skipped, last good value used - F7)
 */
import type { NdviPoint, UsageCategory } from "@/lib/types";
import { USAGE_CATEGORIES } from "@/lib/types";
import { expectedDelta, type LearnedModel } from "@/lib/forecast/calibrate";
import type { DailyFeatures } from "@/lib/forecast/features";
import { meanRecent } from "@/lib/forecast/ensemble";
import { daysBetween } from "@/lib/time";

export const SIGNAL_RULES = {
  dropSlope: -0.003, // m/day counts as "dropping"
  fastFactor: 1.5, // "faster than usual"
  rainDaysThreshold: 30, // days without meaningful rain
  meaningfulRainMm: 2,
  ndviDrop: -0.01, // over ~30 days
  ndviLow: 0.12,
  usageUpFactor: 1.25,
} as const;

export interface LevelSignal {
  on: boolean;
  /** m/day over the last 14 days (Theil-Sen); null if too few readings. */
  recentSlope: number | null;
  /** Expected m/day under usual usage, from the learned model. */
  usualSlope: number;
  fast: boolean;
  nPoints: number;
}

export interface RainSignal {
  on: boolean;
  daysSinceRain: number;
  rainLast60: number;
}

export interface NdviSignal {
  on: boolean;
  latest: number | null;
  latestDate: string | null;
  change30: number | null;
  /** Cloudy scenes skipped since the last good value. */
  skippedCloudy: number;
}

export interface UsageChange {
  category: UsageCategory;
  recent: number;
  usual: number;
  /** recent / usual - 1, or null when usual is ~0 (restarted). */
  change: number | null;
}

export interface Signals {
  level: LevelSignal;
  rain: RainSignal;
  ndvi: NdviSignal;
  agreeing: number;
  usageChanges: UsageChange[];
}

/** Robust slope: median of pairwise slopes. */
export function theilSen(points: { x: number; y: number }[]): number | null {
  if (points.length < 4) return null;
  const s: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      s.push((points[j].y - points[i].y) / (points[j].x - points[i].x));
    }
  }
  s.sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function meanRange(arr: number[], from: number, to: number): number {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, from); i <= Math.min(to, arr.length - 1); i++) {
    s += arr[i];
    n++;
  }
  return n ? s / n : 0;
}

export function computeSignals(args: {
  readings: (number | null)[];
  features: DailyFeatures;
  model: LearnedModel;
  ndvi: NdviPoint[];
  asOfIdx: number;
  asOf: string;
}): Signals {
  const { readings, features: f, model, ndvi, asOfIdx, asOf } = args;

  // 1. Level
  const pts: { x: number; y: number }[] = [];
  for (let i = Math.max(0, asOfIdx - 13); i <= asOfIdx; i++) {
    const v = readings[i];
    if (v !== null) pts.push({ x: i, y: v });
  }
  const recentSlope = theilSen(pts);
  const usualUsage = {} as Record<UsageCategory, number>;
  for (const c of USAGE_CATEGORIES) usualUsage[c] = meanRange(f.usage[c], asOfIdx - 60, asOfIdx - 15);
  const usualSlope = expectedDelta(model, {
    rechargeRain: 0,
    pet: meanRecent(f.pet, asOfIdx, 14),
    usage: usualUsage,
  });
  const dropping = recentSlope !== null && recentSlope < SIGNAL_RULES.dropSlope;
  const fast =
    dropping &&
    (usualSlope >= SIGNAL_RULES.dropSlope / 3 || (recentSlope as number) < SIGNAL_RULES.fastFactor * usualSlope);

  // 2. Rain
  let daysSinceRain = asOfIdx + 1;
  for (let i = asOfIdx; i >= 0; i--) {
    if (f.rain[i] >= SIGNAL_RULES.meaningfulRainMm) {
      daysSinceRain = asOfIdx - i;
      break;
    }
  }
  let rainLast60 = 0;
  for (let i = Math.max(0, asOfIdx - 59); i <= asOfIdx; i++) rainLast60 += f.rain[i];

  // 3. NDVI: skip cloudy scenes, use last good value.
  const known = ndvi.filter((p) => daysBetween(p.date, asOf) >= 0);
  let latestIdx = -1;
  for (let i = known.length - 1; i >= 0; i--) if (known[i].value !== null) { latestIdx = i; break; }
  const skippedCloudy = latestIdx >= 0 ? known.length - 1 - latestIdx : known.length;
  let latest: number | null = null;
  let latestDate: string | null = null;
  let change30: number | null = null;
  if (latestIdx >= 0) {
    latest = known[latestIdx].value;
    latestDate = known[latestIdx].date;
    for (let i = latestIdx - 1; i >= 0; i--) {
      if (known[i].value !== null && daysBetween(known[i].date, latestDate) >= 25) {
        change30 = (latest as number) - (known[i].value as number);
        break;
      }
    }
  }
  const browning =
    latest !== null && ((change30 !== null && change30 <= SIGNAL_RULES.ndviDrop) || latest < SIGNAL_RULES.ndviLow);

  const usageChanges: UsageChange[] = USAGE_CATEGORIES.map((c) => {
    const recent = meanRecent(f.usage[c], asOfIdx, 5);
    const usual = usualUsage[c];
    return { category: c, recent, usual, change: usual > 0.05 ? recent / usual - 1 : null };
  }).filter((u) => u.recent > 0.05 || u.usual > 0.05);

  const level: LevelSignal = { on: dropping, recentSlope, usualSlope, fast, nPoints: pts.length };
  const rain: RainSignal = { on: daysSinceRain >= SIGNAL_RULES.rainDaysThreshold, daysSinceRain, rainLast60 };
  const ndviSig: NdviSignal = { on: browning, latest, latestDate, change30, skippedCloudy };
  return {
    level,
    rain,
    ndvi: ndviSig,
    agreeing: [level.on, rain.on, ndviSig.on].filter(Boolean).length,
    usageChanges,
  };
}
