/**
 * THE single data layer. Every screen, API route and engine reads data from here.
 *
 *  - REAL datasets (data/real) override SIMULATED ones (data/simulated) per dataset.
 *  - Every dataset carries its REAL/SIMULATED label; unlabelled data is rejected.
 *  - getSnapshot(asOf) returns only what was known on `asOf` (the demo clock),
 *    so the forecaster can never see the future.
 *
 * To move to a database later, only this file changes.
 */
import manifestJson from "../../../data/simulated/manifest.json";
import sourcesJson from "../../../data/simulated/sources.json";
import readingsJson from "../../../data/simulated/readings.json";
import usageJson from "../../../data/simulated/usage.json";
import climateJson from "../../../data/simulated/climate.json";
import ndviJson from "../../../data/simulated/ndvi.json";
import observationsJson from "../../../data/simulated/observations.json";
import { REAL_OVERRIDES } from "../../../data/real";
import { addDays, daysBetween, toUtcMs } from "@/lib/time";
import type {
  ClimateData,
  DailySeries,
  Dataset,
  DistrictClimate,
  DatasetId,
  Manifest,
  NdviData,
  ObservationData,
  Provenance,
  ReadingsData,
  Timeline,
  UsageData,
  WaterSource,
} from "@/lib/types";
import { assertLabelled, DATASET_IDS, type DatasetMap } from "./datasets";

const SIMULATED: DatasetMap = {
  sources: sourcesJson as unknown as DatasetMap["sources"],
  readings: readingsJson as unknown as DatasetMap["readings"],
  usage: usageJson as unknown as DatasetMap["usage"],
  climate: climateJson as unknown as DatasetMap["climate"],
  ndvi: ndviJson as unknown as DatasetMap["ndvi"],
  observations: observationsJson as unknown as DatasetMap["observations"],
};

const manifest = manifestJson as Manifest;

function resolve<K extends DatasetId>(id: K): DatasetMap[K] {
  const chosen = (REAL_OVERRIDES[id] ?? SIMULATED[id]) as DatasetMap[K];
  return assertLabelled(chosen, id);
}

const ALL: DatasetMap = {
  sources: resolve("sources"),
  readings: resolve("readings"),
  usage: resolve("usage"),
  climate: resolve("climate"),
  ndvi: resolve("ndvi"),
  observations: resolve("observations"),
};

export function getTimeline(): Timeline {
  return manifest.timeline;
}

export function getSources(): Dataset<WaterSource[]> {
  return ALL.sources;
}

export function getSource(id: string): WaterSource | undefined {
  return ALL.sources.data.find((s) => s.id === id);
}

export interface ProvenanceEntry {
  id: DatasetId;
  title: string;
  provenance: Provenance;
  source: string;
  note: string;
}

/** For the "Data provenance" footer and judges' notes. */
export function getProvenance(): ProvenanceEntry[] {
  return DATASET_IDS.map((id) => {
    const { title, provenance, source, note } = ALL[id];
    return { id, title, provenance, source, note };
  });
}

/** Clamp a requested date into [demoDate, end] (the demo clock only moves forward). */
export function clampAsOf(asOf?: string | null): string {
  const tl = manifest.timeline;
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return tl.demoDate;
  const t = toUtcMs(asOf);
  if (Number.isNaN(t) || t < toUtcMs(tl.demoDate)) return tl.demoDate;
  if (t > toUtcMs(tl.end)) return tl.end;
  return asOf;
}

/** Everything that was known on `asOf`. Daily arrays are cut at that day (inclusive). */
export interface DataSnapshot {
  asOf: string;
  /** Number of days in each truncated daily array (index of asOf + 1). */
  length: number;
  timeline: Timeline;
  sources: Dataset<WaterSource[]>;
  readings: Dataset<ReadingsData>;
  usage: Dataset<UsageData>;
  climate: Dataset<ClimateData>;
  ndvi: Dataset<NdviData>;
  observations: Dataset<ObservationData>;
}

const cache = new Map<string, DataSnapshot>();

export function getSnapshot(requested?: string | null): DataSnapshot {
  const asOf = clampAsOf(requested);
  const hit = cache.get(asOf);
  if (hit) return hit;

  const tl = manifest.timeline;
  const n = daysBetween(tl.start, asOf) + 1;
  const cut = <T>(arr: T[]) => arr.slice(0, n);
  const before = (date: string) => toUtcMs(date) <= toUtcMs(asOf);

  const readings: ReadingsData = {};
  for (const [id, s] of Object.entries(ALL.readings.data)) {
    readings[id] = { start: s.start, values: cut(s.values) } satisfies DailySeries;
  }

  const usageSeries: UsageData["series"] = {};
  for (const [id, s] of Object.entries(ALL.usage.data.series)) {
    usageSeries[id] = { fetch: cut(s.fetch), spot: cut(s.spot), pump: cut(s.pump) };
  }

  const cutClimate = (c: DistrictClimate): DistrictClimate => ({
    rainMm: cut(c.rainMm),
    tmaxC: cut(c.tmaxC),
    tminC: cut(c.tminC),
    petMm: cut(c.petMm),
  });
  const districts = {} as ClimateData["districts"];
  for (const [d, c] of Object.entries(ALL.climate.data.districts) as [keyof ClimateData["districts"], DistrictClimate][]) {
    districts[d] = cutClimate(c);
  }
  let climateSources: ClimateData["sources"];
  if (ALL.climate.data.sources) {
    climateSources = {};
    for (const [id, c] of Object.entries(ALL.climate.data.sources)) climateSources[id] = cutClimate(c);
  }

  const ndvi: NdviData = {};
  for (const [id, pts] of Object.entries(ALL.ndvi.data)) ndvi[id] = pts.filter((p) => before(p.date));

  const observations: ObservationData = {};
  for (const [id, obs] of Object.entries(ALL.observations.data)) {
    observations[id] = obs.filter((o) => before(o.date));
  }

  const snap: DataSnapshot = {
    asOf,
    length: n,
    timeline: tl,
    sources: ALL.sources,
    readings: { ...ALL.readings, data: readings },
    usage: { ...ALL.usage, data: { ...ALL.usage.data, series: usageSeries } },
    climate: {
      ...ALL.climate,
      data: {
        ...ALL.climate.data,
        districts,
        sources: climateSources,
        origin: ALL.climate.data.origin ? cut(ALL.climate.data.origin) : undefined,
      },
    },
    ndvi: { ...ALL.ndvi, data: ndvi },
    observations: { ...ALL.observations, data: observations },
  };
  cache.set(asOf, snap);
  return snap;
}

/** Date of daily index i on the global timeline. */
export function dateAt(i: number): string {
  return addDays(manifest.timeline.start, i);
}
