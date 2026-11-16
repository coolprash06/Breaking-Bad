/**
 * Alert engine (F4, F7): forecast + signals -> raw tier per day ->
 * persistence/hysteresis -> displayed tier with confidence and reasons.
 */
import { dateAt, getSnapshot, getSources } from "@/lib/data/store";
import { addDays, daysBetween } from "@/lib/time";
import type { WaterSource } from "@/lib/types";
import { buildFeatures } from "@/lib/forecast/features";
import { forecastSource } from "@/lib/forecast/engine";
import { meanRecent, runEnsemble } from "@/lib/forecast/ensemble";
import { daysSinceLastReading } from "@/lib/data/series";
import { computeSignals, type Signals } from "./signals";
import {
  applyPersistence,
  rawTier,
  TIER_RULES,
  type DisplayTier,
  type RawTier,
  type RiskTier,
} from "./tiers";
import { buildReasons, type Reason } from "./reasons";

/** Days of history re-evaluated for the persistence check. */
const PERSISTENCE_WINDOW = 8;
const HISTORY_MEMBERS = 150;
const HISTORY_HORIZON = 120;

export interface SourceStatus {
  sourceId: string;
  asOf: string;
  /** What the map shows. Grey ("nodata") overrides risk when the sensor is silent. */
  tier: DisplayTier;
  /** Risk tier after persistence, even when Grey (for Category 4 users). */
  riskTier: RiskTier;
  /** Today's raw evaluation before persistence. */
  rawTier: RiskTier;
  capped: boolean;
  pending: { to: RiskTier; daysHeld: number; needed: number } | null;
  since: string;
  /** Probability the failure falls inside the stated window (or of NOT failing, if safe). */
  confidence: number;
  /** "~5 weeks left, 70% confident" */
  label: string;
  /** "Likely to fail in 4-6 weeks" */
  windowLabel: string;
  /** The same window as numbers (toWeeks null = not expected to fail within the horizon). */
  window: { fromWeeks: number; toWeeks: number | null };
  ttf: { p10: number | null; p50: number | null; p90: number | null };
  probFail: number;
  currentLevel: number;
  levelSd: number;
  startKind: "sensor" | "manual" | "none";
  lastReading: { date: string; value: number; daysAgo: number } | null;
  signals: Signals;
  reasons: Reason[];
  /** One line with tier + estimate + confidence (confidence stated in every alert). */
  summary: string;
}

const statusCache = new Map<string, SourceStatus>();

function evaluateRawAt(
  source: WaterSource,
  dayIdx: number,
  ctx: {
    snapAsOf: string;
    readings: (number | null)[];
    features: ReturnType<typeof buildFeatures>;
    model: ReturnType<typeof forecastSource>["model"];
    observations: { date: string; levelM: number }[];
    ndvi: ReturnType<typeof getSnapshot>["ndvi"]["data"][string];
    tlStart: string;
  },
): RawTier {
  const date = dateAt(dayIdx);
  const ens = runEnsemble({
    source,
    model: ctx.model,
    features: ctx.features,
    readings: ctx.readings,
    observations: ctx.observations,
    dateToIdx: (d) => daysBetween(ctx.tlStart, d),
    asOfIdx: dayIdx,
    asOf: date,
    members: HISTORY_MEMBERS,
    horizon: HISTORY_HORIZON,
    skipBand: true,
  });
  const sig = computeSignals({
    readings: ctx.readings,
    features: ctx.features,
    model: ctx.model,
    ndvi: ctx.ndvi,
    asOfIdx: dayIdx,
    asOf: date,
  });
  return rawTier({
    currentLevel: ens.start.level,
    failureLevel: source.failureLevelM,
    ttfP10: ens.ttf.p10,
    ttfP50: ens.ttf.p50,
    fastDrop: sig.level.fast,
    agreeing: sig.agreeing,
  });
}

export function evaluateSource(source: WaterSource, asOf?: string | null): SourceStatus {
  const snap = getSnapshot(asOf);
  const key = `${source.id}@${snap.asOf}`;
  const hit = statusCache.get(key);
  if (hit) return hit;

  const asOfIdx = snap.length - 1;
  const readings = snap.readings.data[source.id].values;
  const features = buildFeatures(snap, source);
  const fc = forecastSource(source, snap.asOf);
  const ndvi = snap.ndvi.data[source.id] ?? [];
  const observations = snap.observations.data[source.id] ?? [];

  const signals = computeSignals({ readings, features, model: fc.model, ndvi, asOfIdx, asOf: snap.asOf });
  const todayRaw = rawTier({
    currentLevel: fc.ensemble.start.level,
    failureLevel: source.failureLevelM,
    ttfP10: fc.ensemble.ttf.p10,
    ttfP50: fc.ensemble.ttf.p50,
    fastDrop: signals.level.fast,
    agreeing: signals.agreeing,
  });

  // Re-evaluate the previous days with the current learned model for persistence.
  const ctx = { snapAsOf: snap.asOf, readings, features, model: fc.model, observations, ndvi, tlStart: snap.timeline.start };
  const raws: RawTier[] = [];
  for (let k = PERSISTENCE_WINDOW - 1; k >= 1; k--) {
    const d = asOfIdx - k;
    if (d >= 0) raws.push(evaluateRawAt(source, d, ctx));
  }
  raws.push(todayRaw);
  const persisted = applyPersistence(raws);

  const sinceReading = daysSinceLastReading(readings, asOfIdx);
  const lastIdx = sinceReading === null ? -1 : asOfIdx - sinceReading;
  const grey = sinceReading === null || sinceReading > TIER_RULES.noDataDays;
  const tier: DisplayTier = grey ? "nodata" : persisted.tier;

  const reasons = buildReasons({
    signals,
    daysSinceReading: sinceReading ?? 999,
    startKind: fc.ensemble.start.kind,
    startDate: fc.ensemble.start.fromIdx >= 0 ? dateAt(fc.ensemble.start.fromIdx) : null,
    bandWidening: fc.ensemble.widening.factor,
    petRecent: meanRecent(features.pet, asOfIdx, 14),
    monsoon: snap.climate.data.monsoon?.[source.id] ?? null,
  });

  const confidencePct = Math.round(fc.window.confidence * 100);
  const tierWord =
    tier === "nodata"
      ? "No recent data"
      : persisted.tier[0].toUpperCase() + persisted.tier.slice(1);
  const summary = `${tierWord}: ${fc.window.label.toLowerCase()} (${confidencePct}% confident)`;

  const status: SourceStatus = {
    sourceId: source.id,
    asOf: snap.asOf,
    tier,
    riskTier: persisted.tier,
    rawTier: todayRaw.tier,
    capped: todayRaw.capped,
    pending: persisted.pending ? { ...persisted.pending, needed: TIER_RULES.persistenceDays } : null,
    since: addDays(snap.asOf, -(raws.length - 1 - persisted.sinceIdx)),
    confidence: fc.window.confidence,
    label: fc.label,
    windowLabel: fc.window.label,
    window: { fromWeeks: fc.window.fromWeeks, toWeeks: fc.window.toWeeks },
    ttf: fc.ensemble.ttf,
    probFail: fc.ensemble.probFail,
    currentLevel: fc.ensemble.start.level,
    levelSd: fc.ensemble.start.sd,
    startKind: fc.ensemble.start.kind,
    lastReading:
      lastIdx >= 0 ? { date: dateAt(lastIdx), value: readings[lastIdx] as number, daysAgo: sinceReading as number } : null,
    signals,
    reasons,
    summary,
  };
  statusCache.set(key, status);
  return status;
}

export function evaluateAll(asOf?: string | null): SourceStatus[] {
  return getSources().data.map((s) => evaluateSource(s, asOf));
}
