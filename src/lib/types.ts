/**
 * Shared domain types. ONE data layer, ONE forecast engine, four "lenses".
 */

// ---------- Provenance (PRD Section 7 rule) ----------

/** Every dataset in the app is labelled REAL or SIMULATED. */
export type Provenance = "REAL" | "SIMULATED";

export type DatasetId =
  | "sources"
  | "readings"
  | "usage"
  | "climate"
  | "ndvi"
  | "observations";

/** Wrapper that every dataset must travel in. The store never returns bare data. */
export interface Dataset<T> {
  id: DatasetId;
  provenance: Provenance;
  title: string;
  /** Where the data comes from (or what it stands in for). */
  source: string;
  note: string;
  data: T;
}

// ---------- Geography & sources ----------

export type Region = "thar" | "kutch";

export type DistrictId =
  | "jaisalmer"
  | "barmer"
  | "bikaner"
  | "phalodi"
  | "bhuj"
  | "rapar"
  | "banni"
  | "lakhpat";

export type SourceType =
  | "dug_well"
  | "borewell"
  | "stepwell"
  | "nadi"
  | "tanka"
  | "beri_virda"
  | "oasis";

/** Persona categories that physically draw water (PRD Section 4, Cat 1-3). */
export type UsageCategory = "fetch" | "spot" | "pump";

/** All 4 persona categories; "manage" (Cat 4) oversees but does not draw water. */
export type PersonaCategory = UsageCategory | "manage";

export const USAGE_CATEGORIES: readonly UsageCategory[] = ["fetch", "spot", "pump"];

export interface WaterSource {
  id: string;
  name: string;
  type: SourceType;
  region: Region;
  district: DistrictId;
  /** Human label for the location. Locations are ILLUSTRATIVE until confirmed. */
  placeLabel: string;
  illustrativeLocation: true;
  lat: number;
  lon: number;
  /** Usable water level, metres (water column above the point where the source fails). */
  capacityM: number;
  /** Level at or below which the source is considered failed (dry / unusable). */
  failureLevelM: number;
  /** Can the source serve livestock (needed for Cat 2 herd suggestions)? */
  animalCapable: boolean;
  usedBy: UsageCategory[];
  /** Who depends on it (for "who is affected"). */
  people: { households: number; animals: number; farms: number };
  /** Has periodic manual measurements (CGWB-style observation well). */
  observationWell: boolean;
}

// ---------- Time series ----------

/** Daily series aligned to the global timeline: values[i] is for addDays(start, i). */
export interface DailySeries {
  start: string; // ISO date YYYY-MM-DD
  values: (number | null)[];
}

export interface Timeline {
  start: string;
  /** "Today" for the demo; the demo clock can move forward from here. */
  demoDate: string;
  end: string;
  days: number;
}

/** Sensor readings of usable level (m). null = no reading (gap / dead sensor). */
export type ReadingsData = Record<string, DailySeries>;

/**
 * Daily usage per category, in natural units:
 *  fetch = households drawing (tanker trips counted as household-equivalents)
 *  spot  = animal-equivalents (livestock + people bathing / travellers)
 *  pump  = pump-hours per day
 */
export interface UsageData {
  start: string;
  units: Record<UsageCategory, string>;
  series: Record<string, Record<UsageCategory, number[]>>;
}

export interface DistrictClimate {
  rainMm: number[];
  tmaxC: number[];
  tminC: number[];
  /** Potential evapotranspiration, mm/day (Hargreaves-style estimate). */
  petMm: number[];
}

export interface ClimateData {
  start: string;
  districts: Record<DistrictId, DistrictClimate>;
}

export interface NdviPoint {
  date: string;
  /** null when the scene was cloudy and skipped. */
  value: number | null;
  cloudy: boolean;
}

export type NdviData = Record<string, NdviPoint[]>;

export interface Observation {
  date: string;
  levelM: number;
}

export type ObservationData = Record<string, Observation[]>;

export interface Manifest {
  generator: string;
  seed: number;
  timeline: Timeline;
}
