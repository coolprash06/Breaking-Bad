/**
 * SIMULATED data generator (PRD Section 7).
 *
 * Physics per source and day t (level = usable water column, metres):
 *
 *   delta[t] = rechargePerMm * rain[t]
 *            - evapFactor/1000 * PET[t]
 *            - sum_k ratePerUnit[k] * trueUsage_k[t]     (k = fetch, spot, pump)
 *            + driftPerDay
 *            + processNoise
 *
 * The level is anchored at a target value on the demo date. History is
 * simulated BACKWARDS from that anchor and the future (revealed by the demo
 * clock) FORWARDS, clipped to [0, capacity] (overflow / dry).
 *
 * Messy-data features: sensor noise, random gaps, long outages, a dead sensor,
 * rare spikes, cloudy NDVI scenes, and usage "reported" with its own error.
 *
 * REAL drivers (when data/real/ has them, see scripts/fetch-real.ts):
 *  - rain[t] and PET[t] are the REAL daily ERA5 rainfall and FAO-56 reference
 *    evapotranspiration at the source's own coordinates (Open-Meteo);
 *  - groundwater-fed sources (dug wells, borewells, stepwells) get the REAL
 *    district background decline from CGWB GWRA 2025 (extraction minus extractable
 *    resource) added to their drift.
 * The level of each village source itself stays SIMULATED: no public daily data exists.
 */
import type {
  ClimateData,
  Dataset,
  Manifest,
  NdviData,
  ObservationData,
  ReadingsData,
  SourceType,
  Timeline,
  UsageCategory,
  UsageData,
  WaterSource,
} from "@/lib/types";
import { USAGE_CATEGORIES, climateFor } from "@/lib/types";
import { GWRA_DISTRICT_OF } from "@/lib/real/types";
import type { RealInputs } from "./realInputs";
import { addDays, daysBetween, monthOf, toUtcMs } from "@/lib/time";
import { generateClimate, round } from "./climate";
import { laggedRain } from "@/lib/data/series";
import { GROUNDWATER_RAIN_LAG_DAYS } from "@/config/thresholds";
import { rngFor } from "./prng";
import { DEMO_DATE, LITRES_PER_UNIT, SOURCE_SPECS, type SourceSpec } from "./specs";

export const DEFAULT_SEED = 20261116;
export const HISTORY_DAYS = 364; // demo date index
export const FUTURE_DAYS = 56; // 8 weeks the demo clock can reveal

export function buildTimeline(): Timeline {
  const start = addDays(DEMO_DATE, -HISTORY_DAYS);
  const end = addDays(DEMO_DATE, FUTURE_DAYS);
  return { start, demoDate: DEMO_DATE, end, days: daysBetween(start, end) + 1 };
}

/** Source types whose recharge arrives through the ground, with a delay. */
export function usesLaggedRecharge(type: SourceType): boolean {
  return type === "dug_well" || type === "stepwell";
}

/** Rain series that drives recharge for a source type (same-day or infiltration-lagged). */
export function rainFeatureFor(type: SourceType, rainMm: number[]): number[] {
  return usesLaggedRecharge(type) ? laggedRain(rainMm, GROUNDWATER_RAIN_LAG_DAYS) : rainMm;
}

/** Seasonal multiplier on usage by category and month. */
export function usageSeason(cat: UsageCategory, month: number): number {
  const summer = month >= 4 && month <= 6;
  const monsoon = month >= 7 && month <= 9;
  if (cat === "fetch") return summer ? 1.25 : monsoon ? 0.8 : 1.0;
  if (cat === "spot") return summer ? 1.4 : monsoon ? 0.8 : 1.0;
  // pump: rabi irrigation Nov-Feb, tapering in March, low otherwise
  if (month === 11 || month === 12 || month <= 2) return 1.0;
  if (month === 3) return 0.7;
  if (month === 10) return 0.5;
  return summer ? 0.25 : 0.2;
}

export function ratePerUnit(spec: SourceSpec): Record<UsageCategory, number> {
  const out = {} as Record<UsageCategory, number>;
  for (const c of USAGE_CATEGORIES) {
    out[c] = LITRES_PER_UNIT[c] / spec.hidden.effAreaM2 / 1000;
  }
  return out;
}

/** Base usage per day with scheduled events and linear ramps. */
function baseUsageSeries(spec: SourceSpec, tl: Timeline): Record<UsageCategory, number[]> {
  const out = { fetch: [], spot: [], pump: [] } as Record<UsageCategory, number[]>;
  for (const c of USAGE_CATEGORIES) {
    const events = (spec.events ?? []).filter((e) => e.category === c);
    for (let i = 0; i < tl.days; i++) {
      const date = addDays(tl.start, i);
      const t = toUtcMs(date);
      const ev = events.find(
        (e) => t >= toUtcMs(e.from) && (e.to === undefined || t <= toUtcMs(e.to)),
      );
      if (!ev) {
        out[c].push(spec.baseUsage[c]);
        continue;
      }
      const since = daysBetween(ev.from, date);
      const ramp = ev.rampDays ?? 0;
      if (since < ramp) {
        const startIdx = daysBetween(tl.start, ev.from);
        const prev = startIdx > 0 ? out[c][startIdx - 1] : spec.baseUsage[c];
        out[c].push(prev + ((ev.level - prev) * (since + 1)) / (ramp + 1));
      } else {
        out[c].push(ev.level);
      }
    }
  }
  return out;
}

export interface SourceTruth {
  rechargePerMm: number;
  evapPerMmPet: number;
  driftPerDay: number;
  /** Part of driftPerDay set by the REAL CGWB district decline (m/day, <= 0). */
  regionalDriftPerDay: number;
  ratePerUnit: Record<UsageCategory, number>;
  processSd: number;
  sensorSd: number;
  trueLevel: number[];
}

export interface GeneratedData {
  manifest: Manifest;
  sources: Dataset<WaterSource[]>;
  readings: Dataset<ReadingsData>;
  usage: Dataset<UsageData>;
  climate: Dataset<ClimateData>;
  ndvi: Dataset<NdviData>;
  observations: Dataset<ObservationData>;
  /** HIDDEN ground truth: never read by the app, only by tests. */
  truth: { note: string; sources: Record<string, SourceTruth> };
}

/**
 * Find a starting level (and, if needed, a recharge scale) so the forward
 * simulation passes through the spec's target level on the demo date.
 * Both knobs move the demo-date level monotonically, so bisection works.
 */
function anchorToTarget(
  spec: SourceSpec,
  demoIdx: number,
  simulate: (start: number, rechargePerMm: number) => number[],
): { level: number[]; rechargePerMm: number } {
  const target = spec.targetLevelAtDemo;
  const at = (start: number, r: number) => simulate(start, r)[demoIdx];
  const bisect = (lo: number, hi: number, f: (x: number) => number) => {
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  let r = spec.hidden.rechargePerMm;
  let start: number;
  if (at(spec.capacityM, r) < target) {
    // Even starting full we end too low: last monsoon must have recharged more.
    start = spec.capacityM;
    r = bisect(r, r * 6, (x) => at(start, x));
  } else if (at(0, r) > target) {
    // Even starting empty we end too high: recharge was weaker.
    start = 0;
    r = bisect(0, r, (x) => at(start, x));
  } else {
    start = bisect(0, spec.capacityM, (x) => at(x, r));
  }
  return { level: simulate(start, r), rechargePerMm: r };
}

const OBSERVATION_DATES =["2026-01-10", "2026-05-10", "2026-08-20", "2026-11-10"];

/** Source types that draw on the regional aquifer, so they feel its background decline. */
export function isGroundwaterFed(type: SourceType): boolean {
  return type === "dug_well" || type === "borewell" || type === "stepwell";
}

/** REAL background decline (m/day, <= 0) for a source, from the CGWB GWRA district gap. */
export function regionalDrift(spec: Pick<SourceSpec, "type" | "district">, real: RealInputs): number {
  if (!real.gwra || !isGroundwaterFed(spec.type)) return 0;
  const d = real.gwra.districts[GWRA_DISTRICT_OF[spec.district]];
  return d ? -d.impliedDeclineMPerYr / 365 : 0;
}

export function generateAll(seed = DEFAULT_SEED, real: RealInputs = {}): GeneratedData {
  const tl = buildTimeline();
  const demoIdx = daysBetween(tl.start, tl.demoDate);
  const climate = generateClimate(tl, seed);
  if (real.climate && real.climate.data.start !== tl.start) {
    throw new Error(`REAL climate starts ${real.climate.data.start}, timeline starts ${tl.start}`);
  }

  const sources: WaterSource[] = [];
  const readings: ReadingsData = {};
  const usageSeries: UsageData["series"] = {};
  const ndvi: NdviData = {};
  const observations: ObservationData = {};
  const truth: Record<string, SourceTruth> = {};

  for (const spec of SOURCE_SPECS) {
    const clim = real.climate ? climateFor(real.climate.data, spec) : climate.districts[spec.district];
    if (clim.rainMm.length < tl.days) throw new Error(`climate for ${spec.id} is shorter than the timeline`);
    const rng = rngFor(seed, `source:${spec.id}`);
    const rates = ratePerUnit(spec);
    const evapPerMm = spec.hidden.evapFactor / 1000;
    const regional = regionalDrift(spec, real);
    const driftPerDay = spec.hidden.driftPerDay + regional;

    // ---- usage: true (drives physics) and reported (what the model sees) ----
    const base = baseUsageSeries(spec, tl);
    const trueUsage = { fetch: [], spot: [], pump: [] } as Record<UsageCategory, number[]>;
    const reported = { fetch: [], spot: [], pump: [] } as Record<UsageCategory, number[]>;
    for (let i = 0; i < tl.days; i++) {
      const m = monthOf(addDays(tl.start, i));
      for (const c of USAGE_CATEGORIES) {
        const u = base[c][i] * usageSeason(c, m) * rng.lognormalFactor(0.12);
        trueUsage[c].push(u);
        reported[c].push(round(u * rng.lognormalFactor(0.05), c === "pump" ? 2 : 1));
      }
    }

    // ---- daily level change, split into a rain term and everything else ----
    const lossDelta = new Array<number>(tl.days).fill(0);
    for (let i = 1; i < tl.days; i++) {
      let d = -evapPerMm * clim.petMm[i] + driftPerDay + rng.normal(0, spec.hidden.processSd);
      for (const c of USAGE_CATEGORIES) d -= rates[c] * trueUsage[c][i];
      lossDelta[i] = d;
    }

    // Groundwater-fed sources feel rain with an infiltration delay; surface water feels it the same day.
    const rechargeRain = rainFeatureFor(spec.type, clim.rainMm);

    // ---- level: forward simulation, clipped to [0, capacity] (dry / overflow) ----
    const simulate = (start: number, rechargePerMm: number): number[] => {
      const lv = new Array<number>(tl.days).fill(0);
      lv[0] = start;
      for (let i = 1; i < tl.days; i++) {
        const next = lv[i - 1] + rechargePerMm * rechargeRain[i] + lossDelta[i];
        lv[i] = Math.min(spec.capacityM, Math.max(0, next));
      }
      return lv;
    };
    const { level, rechargePerMm } = anchorToTarget(spec, demoIdx, simulate);

    // ---- sensor readings with gaps, outages, dead sensor and spikes ----
    const gapMask = new Array<boolean>(tl.days).fill(false);
    const protectFrom = spec.protectDemoWindow ? demoIdx - 10 : Infinity;
    let gapLeft = 0;
    for (let i = 0; i < tl.days; i++) {
      if (gapLeft > 0) {
        gapMask[i] = true;
        gapLeft--;
      } else if (i < protectFrom && rng.bernoulli(1 / 45)) {
        gapMask[i] = true;
        gapLeft = rng.int(1, 7) - 1;
      }
    }
    for (const g of spec.extraGaps ?? []) {
      const s = daysBetween(tl.start, g.from);
      for (let i = s; i < s + g.days && i < tl.days; i++) if (i >= 0) gapMask[i] = true;
    }
    if (spec.deadSensorDaysBeforeDemo !== undefined) {
      for (let i = demoIdx - spec.deadSensorDaysBeforeDemo + 1; i < tl.days; i++) gapMask[i] = true;
    }

    const values: (number | null)[] = [];
    for (let i = 0; i < tl.days; i++) {
      if (gapMask[i]) {
        values.push(null);
        continue;
      }
      let v = level[i] + rng.normal(0, spec.sensorSd);
      if (i < protectFrom && rng.bernoulli(0.003)) {
        v += (rng.bernoulli(0.5) ? 1 : -1) * rng.uniform(0.2, 0.5); // sensor glitch
      }
      values.push(round(Math.max(0, v), 3));
    }
    readings[spec.id] = { start: tl.start, values };

    // ---- quarterly manual measurements (CGWB-style stand-in) ----
    const isGroundwater = spec.type === "dug_well" || spec.type === "borewell" || spec.type === "stepwell";
    if (isGroundwater) {
      observations[spec.id] = OBSERVATION_DATES.map((date) => ({
        date,
        levelM: round(level[daysBetween(tl.start, date)] + rng.normal(0, 0.02), 2),
      }));
    }

    // ---- NDVI every 5 days around the source (Sentinel-2 stand-in) ----
    const points: NdviData[string] = [];
    let soil = 0.5;
    for (let i = 0; i < tl.days; i++) {
      soil = soil * Math.exp(-1 / 25) + clim.rainMm[i] / 20;
      if (i % 5 !== 0) continue;
      const date = addDays(tl.start, i);
      const m = monthOf(date);
      const irrigated = spec.baseUsage.pump > 0 || base.pump[i] > 0 ? 0.05 * usageSeason("pump", m) : 0;
      const nd = 0.08 + 0.25 * (1 - Math.exp(-soil)) + irrigated + rng.normal(0, 0.008);
      const cloudP = (m >= 7 && m <= 9) || clim.rainMm[i] > 0 ? 0.45 : 0.07;
      const cloudy = rng.bernoulli(cloudP);
      points.push({ date, value: cloudy ? null : round(nd, 3), cloudy });
    }
    ndvi[spec.id] = points;

    usageSeries[spec.id] = reported;

    const usedBy = USAGE_CATEGORIES.filter(
      (c) => spec.baseUsage[c] > 0 || (spec.events ?? []).some((e) => e.category === c && e.level > 0),
    );
    sources.push({
      id: spec.id,
      name: spec.name,
      type: spec.type,
      region: spec.region,
      district: spec.district,
      placeLabel: spec.placeLabel,
      illustrativeLocation: true,
      lat: spec.lat,
      lon: spec.lon,
      capacityM: spec.capacityM,
      failureLevelM: spec.failureLevelM,
      animalCapable: spec.animalCapable,
      usedBy,
      people: spec.people,
      observationWell: isGroundwater,
    });

    truth[spec.id] = {
      rechargePerMm,
      evapPerMmPet: evapPerMm,
      driftPerDay,
      regionalDriftPerDay: regional,
      ratePerUnit: rates,
      processSd: spec.hidden.processSd,
      sensorSd: spec.sensorSd,
      trueLevel: level.map((x) => round(x, 4)),
    };
  }

  const sim = "SIMULATED" as const;
  return {
    manifest: { generator: "scripts/generate-data.ts", seed, timeline: tl },
    sources: {
      id: "sources",
      provenance: sim,
      title: "Water sources",
      source: "Seeded generator (src/lib/sim/specs.ts)",
      note: `${sources.length} sources across Thar and Kutch. Locations are illustrative placeholders.`,
      data: sources,
    },
    readings: {
      id: "readings",
      provenance: sim,
      title: "Daily sensor readings",
      source: real.climate
        ? "Seeded generator: water balance driven by REAL rainfall / evaporation (ERA5) and REAL district groundwater decline (CGWB GWRA 2025), + sensor noise"
        : "Seeded generator: water balance + sensor noise",
      note: "Daily level of each village source (no public daily data exists for these), with gaps, outages, a dead sensor and rare glitches.",
      data: readings,
    },
    usage: {
      id: "usage",
      provenance: sim,
      title: "Usage by persona category",
      source: "Seeded generator",
      note: "Reported daily usage: households, animal-equivalents and pump-hours, with seasonal patterns and events.",
      data: {
        start: tl.start,
        units: { fetch: "households/day", spot: "animal-equivalents/day", pump: "pump-hours/day" },
        series: usageSeries,
      },
    },
    climate: {
      id: "climate",
      provenance: sim,
      title: "Rainfall and temperature",
      source: "Seeded generator (stand-in for REAL CHIRPS / IMD)",
      note: "Deficit 2026 monsoon with early withdrawal; rare winter showers. PET from a Hargreaves-style formula.",
      data: climate,
    },
    ndvi: {
      id: "ndvi",
      provenance: sim,
      title: "Vegetation greenness (NDVI)",
      source: "Seeded generator (stand-in for REAL Sentinel-2)",
      note: "Every 5 days around each source; cloudy scenes are skipped (value null).",
      data: ndvi,
    },
    observations: {
      id: "observations",
      provenance: sim,
      title: "Quarterly groundwater measurements",
      source: "Seeded generator (stand-in for REAL CGWB / India-WRIS observation wells)",
      note: "Manual measurements about 4 times a year for wells, borewells and stepwells.",
      data: observations,
    },
    truth: {
      note: "HIDDEN ground truth used only by tests to check the forecaster learns these values. The app must never read this file.",
      sources: truth,
    },
  };
}
