/**
 * THE single forecast engine. Every tab, API route and alert uses this.
 * Learn -> estimate today's level -> ensemble forecast -> failure window.
 */
import { dateAt, getSnapshot, type DataSnapshot } from "@/lib/data/store";
import { addDays, daysBetween } from "@/lib/time";
import type { UsageCategory, WaterSource } from "@/lib/types";
import { buildFeatures, type DailyFeatures } from "./features";
import { learnParameters, type LearnedModel } from "./calibrate";
import { failureWindow, HORIZON_DAYS, runEnsemble, type EnsembleResult, type UsageCut } from "./ensemble";

export interface SourceForecast {
  sourceId: string;
  asOf: string;
  horizonDays: number;
  model: LearnedModel;
  ensemble: EnsembleResult;
  window: ReturnType<typeof failureWindow>;
  /** "~5 weeks left, 70% confident" */
  label: string;
  usageCut: UsageCut;
}

const learnCache = new Map<string, LearnedModel>();
const forecastCache = new Map<string, SourceForecast>();

function cutKey(cut: UsageCut): string {
  return (["fetch", "spot", "pump"] as UsageCategory[]).map((c) => cut[c] ?? 0).join(",");
}

export function learnFor(snap: DataSnapshot, source: WaterSource, f?: DailyFeatures): LearnedModel {
  const key = `${source.id}@${snap.asOf}`;
  const hit = learnCache.get(key);
  if (hit) return hit;
  const m = learnParameters(source, snap.readings.data[source.id].values, f ?? buildFeatures(snap, source), dateAt);
  learnCache.set(key, m);
  return m;
}

export function forecastSource(
  source: WaterSource,
  asOf?: string | null,
  opts: { usageCut?: UsageCut; members?: number } = {},
): SourceForecast {
  const snap = getSnapshot(asOf);
  const usageCut = opts.usageCut ?? {};
  const key = `${source.id}@${snap.asOf}#${cutKey(usageCut)}#${opts.members ?? "d"}`;
  const hit = forecastCache.get(key);
  if (hit) return hit;

  const f = buildFeatures(snap, source);
  const model = learnFor(snap, source, f);
  const tlStart = snap.timeline.start;
  const ensemble = runEnsemble({
    source,
    model,
    features: f,
    readings: snap.readings.data[source.id].values,
    observations: snap.observations.data[source.id] ?? [],
    dateToIdx: (d) => daysBetween(tlStart, d),
    asOfIdx: snap.length - 1,
    asOf: snap.asOf,
    usageCut,
    members: opts.members,
  });
  const window = failureWindow(ensemble);
  const pct = Math.round(window.confidence * 100);
  const result: SourceForecast = {
    sourceId: source.id,
    asOf: snap.asOf,
    horizonDays: HORIZON_DAYS,
    model,
    ensemble,
    window,
    label: `${window.short}, ${pct}% confident`,
    usageCut,
  };
  forecastCache.set(key, result);
  return result;
}

/** Calendar date of a forecast day offset. */
export function forecastDate(f: SourceForecast, day: number): string {
  return addDays(f.asOf, day);
}
