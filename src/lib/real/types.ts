/**
 * Shapes of the REAL reference datasets cached in data/real/ by `npm run fetch-real`.
 * They are context layers (district groundwater stress, CGWB observation wells),
 * separate from the per-source datasets in DatasetMap.
 */
import type { DistrictId } from "@/lib/types";

/** CGWB assessment-unit categories (GWRA methodology). */
export type GwCategory = "safe" | "semi_critical" | "critical" | "over_exploited" | "saline";

/** Districts as named in the CGWB National Compilation, 2025. */
export type GwraDistrictKey = "barmer" | "jaisalmer" | "bikaner" | "jodhpur" | "kachchh";

/**
 * App district -> CGWB assessment district. Phalodi became a district in 2023, but
 * GWRA 2025 still reports the Phalodi block under Jodhpur; the Kutch areas are all
 * in Kachchh district.
 */
export const GWRA_DISTRICT_OF: Record<DistrictId, GwraDistrictKey> = {
  jaisalmer: "jaisalmer",
  barmer: "barmer",
  bikaner: "bikaner",
  phalodi: "jodhpur",
  bhuj: "kachchh",
  rapar: "kachchh",
  banni: "kachchh",
  lakhpat: "kachchh",
};

export interface GwraDistrict {
  key: GwraDistrictKey;
  name: string;
  state: "Rajasthan" | "Gujarat";
  /** All volumes in hectare-metres (ham) per year, as printed. 1 ham = 0.01 million m3. */
  rechargeHam: number;
  naturalDischargeHam: number;
  extractableHam: number;
  extraction: { irrigationHam: number; industrialHam: number; domesticHam: number; totalHam: number };
  /** Stage of ground water extraction (%) = extraction / extractable resource. */
  stagePct: number;
  /** Category implied by the stage, CGWB thresholds (<=70 / 70-90 / 90-100 / >100). */
  stageCategory: GwCategory;
  /** Recharge-worthy area of assessed units (km2). */
  rechargeAreaKm2: number | null;
  /** Number of assessment units (blocks / talukas) in the district. */
  unitsTotal: number | null;
  /** extraction - extractable resource (ham/yr); > 0 means the aquifer is being mined. */
  gapHam: number;
  /** Background decline implied by the gap: gap / (area x specific yield), m/yr (0 if no gap). */
  impliedDeclineMPerYr: number;
  /** PDF page numbers the figures were read from. */
  pages: { resources: number; area: number | null; units: number | null };
}

export interface GwraBlock {
  /** Name exactly as printed (e.g. "Jaisalmer_Rural", "Gandhidham (C)"). */
  name: string;
  /** Plain display name. */
  label: string;
  district: GwraDistrictKey;
  category: GwCategory;
  /** Stage of extraction (%) when the compilation prints it (category-change tables). */
  stagePct: number | null;
  /** 2024 category and stage, when printed. */
  previous: { category: GwCategory; stagePct: number } | null;
  /** Listed under "affected by salinity" in the quality chapter. */
  salinityAffected: boolean;
  /** Block HQ town position (GeoNames via Open-Meteo geocoding); null if not found. */
  point: { lat: number; lon: number; matched: string } | null;
  page: number;
}

export interface GwraData {
  title: string;
  publisher: string;
  url: string;
  published: string;
  retrieved: string;
  /** Specific yield assumed to turn the volume gap into a level decline. */
  specificYield: number;
  districts: Record<GwraDistrictKey, GwraDistrict>;
  blocks: GwraBlock[];
  notes: string[];
}

export interface CgwbWellReading {
  date: string;
  /** Depth to water below ground level, metres (larger = deeper). */
  depthM: number;
}

export interface CgwbWell {
  code: string;
  name: string;
  lat: number;
  lon: number;
  wellType: string | null;
  aquifer: string | null;
  wellDepthM: number | null;
  /** App district this reference well sits nearest to (for grouping only). */
  near: DistrictId;
  /** Nearest app source and its distance, for the "reference well" link in the readout. */
  nearestSourceId: string;
  nearestKm: number;
  readings: CgwbWellReading[];
  /** Least-squares trend of the pre-monsoon (Mar-Jun) depth, m/yr (positive = water table falling). */
  preMonsoonTrendMPerYr: number | null;
}

export interface CgwbWellsData {
  title: string;
  publisher: string;
  url: string;
  retrieved: string;
  wells: CgwbWell[];
  notes: string[];
}

export interface RealContext {
  gwra: GwraData | null;
  wells: CgwbWellsData | null;
}
