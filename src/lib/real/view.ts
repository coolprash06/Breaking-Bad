/**
 * Compact REAL reference context sent to the main screen (types only, client-safe).
 * Built once on the server from data/real/ (it does not change with the demo clock).
 */
import type { ClimateOrigin, MonsoonSummary } from "@/lib/types";
import type { CgwbWellReading, GwCategory, GwraDistrictKey } from "./types";

export interface GwraDistrictView {
  key: GwraDistrictKey;
  name: string;
  state: string;
  stagePct: number;
  stageCategory: GwCategory;
  /** Million m3 per year. */
  rechargeMcm: number;
  extractableMcm: number;
  extractionMcm: number;
  /** extraction - extractable (million m3/yr); > 0 = aquifer being mined. */
  gapMcm: number;
  impliedDeclineMPerYr: number;
  unitsTotal: number | null;
  /** Units per category; Safe = total minus the named non-safe units. */
  counts: Record<GwCategory, number>;
  salinityUnits: string[];
}

export interface GwraBlockView {
  label: string;
  district: GwraDistrictKey;
  category: GwCategory;
  stagePct: number | null;
  previous: { category: GwCategory; stagePct: number } | null;
  salinityAffected: boolean;
  lat: number | null;
  lon: number | null;
}

export interface WellView {
  code: string;
  name: string;
  lat: number;
  lon: number;
  wellType: string | null;
  wellDepthM: number | null;
  nearestSourceId: string;
  nearestKm: number;
  readings: CgwbWellReading[];
  preMonsoonTrendMPerYr: number | null;
}

export interface SourceRealContext {
  gwDistrict: GwraDistrictKey;
  /** Draws on the regional aquifer, so the GWRA decline applies to it. */
  groundwaterFed: boolean;
  /** Nearest named assessment-unit HQ within 30 km (we have no block boundaries). */
  block: { label: string; category: GwCategory; stagePct: number | null; km: number } | null;
  monsoon: MonsoonSummary | null;
  refWell: { code: string; name: string; km: number; lastDate: string; lastDepthM: number; trend: number | null } | null;
}

export interface RealView {
  gwra: {
    title: string;
    publisher: string;
    url: string;
    retrieved: string;
    specificYield: number;
    districts: Record<GwraDistrictKey, GwraDistrictView>;
    blocks: GwraBlockView[];
  } | null;
  wells: { title: string; publisher: string; url: string; retrieved: string; list: WellView[] } | null;
  climate: { source: string; segments: { origin: ClimateOrigin; from: string; to: string }[]; normal: string | null } | null;
  sources: Record<string, SourceRealContext>;
}

export const GW_CATEGORY_UI: Record<GwCategory, { label: string; short: string }> = {
  safe: { label: "Safe", short: "S" },
  semi_critical: { label: "Semi-critical", short: "SC" },
  critical: { label: "Critical", short: "C" },
  over_exploited: { label: "Over-exploited", short: "OE" },
  saline: { label: "Saline", short: "SAL" },
};
