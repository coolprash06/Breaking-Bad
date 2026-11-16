/**
 * Server-side: turns the cached REAL reference files (data/real/) into the compact
 * RealView used by the main screen. No network access: everything is pre-fetched
 * by `npm run fetch-real`.
 */
import gwraJson from "../../../data/real/gwra-2025.json";
import wellsJson from "../../../data/real/cgwb-wells.json";
import waterJson from "../../../data/real/water-bodies.json";
import { getSnapshot, getSources } from "@/lib/data/store";
import { haversineKm } from "@/lib/alerts/nearest";
import type { SourceType } from "@/lib/types";
import {
  GWRA_DISTRICT_OF,
  type CgwbWellsData,
  type GwCategory,
  type GwraData,
  type GwraDistrictKey,
  type WaterBodiesData,
} from "./types";
import type { GwraDistrictView, RealView, SourceRealContext } from "./view";

const gwra = gwraJson as unknown as GwraData;
const wells = wellsJson as unknown as CgwbWellsData;
const water = waterJson as unknown as WaterBodiesData;

const BLOCK_RADIUS_KM = 30;
const toMcm = (ham: number) => Math.round(ham) / 100; // 1 ham = 0.01 million m3

const groundwaterFed = (t: SourceType) => t === "dug_well" || t === "borewell" || t === "stepwell";

let cached: RealView | null = null;

export function getRealView(): RealView {
  if (cached) return cached;
  const climate = getSnapshot().climate;

  const districts = {} as Record<GwraDistrictKey, GwraDistrictView>;
  for (const d of Object.values(gwra.districts)) {
    const named = gwra.blocks.filter((b) => b.district === d.key);
    const count = (c: GwCategory) => named.filter((b) => b.category === c).length;
    const nonSafe = count("semi_critical") + count("critical") + count("over_exploited") + count("saline");
    districts[d.key] = {
      key: d.key,
      name: d.name,
      state: d.state,
      stagePct: d.stagePct,
      stageCategory: d.stageCategory,
      rechargeMcm: toMcm(d.rechargeHam),
      extractableMcm: toMcm(d.extractableHam),
      extractionMcm: toMcm(d.extraction.totalHam),
      gapMcm: toMcm(d.gapHam),
      impliedDeclineMPerYr: d.impliedDeclineMPerYr,
      unitsTotal: d.unitsTotal,
      counts: {
        // Every non-safe unit is named in the compilation, so the rest are Safe.
        safe: d.unitsTotal !== null ? Math.max(0, d.unitsTotal - nonSafe) : count("safe"),
        semi_critical: count("semi_critical"),
        critical: count("critical"),
        over_exploited: count("over_exploited"),
        saline: count("saline"),
      },
      salinityUnits: named.filter((b) => b.salinityAffected).map((b) => b.label),
    };
  }

  const blocks = gwra.blocks.map((b) => ({
    label: b.label,
    district: b.district,
    category: b.category,
    stagePct: b.stagePct,
    previous: b.previous,
    salinityAffected: b.salinityAffected,
    lat: b.point?.lat ?? null,
    lon: b.point?.lon ?? null,
  }));

  const sources: Record<string, SourceRealContext> = {};
  for (const s of getSources().data) {
    const gd = GWRA_DISTRICT_OF[s.district];
    let block: SourceRealContext["block"] = null;
    for (const b of blocks) {
      if (b.district !== gd || b.lat === null || b.lon === null) continue;
      const km = haversineKm(s, { lat: b.lat, lon: b.lon });
      if (km <= BLOCK_RADIUS_KM && (!block || km < block.km)) {
        block = { label: b.label, category: b.category, stagePct: b.stagePct, km: Math.round(km * 10) / 10 };
      }
    }
    let refWell: SourceRealContext["refWell"] = null;
    for (const w of wells.wells) {
      const last = w.readings[w.readings.length - 1];
      if (!last) continue;
      const km = haversineKm(s, w);
      if (!refWell || km < refWell.km) {
        refWell = {
          code: w.code,
          name: w.name,
          km: Math.round(km * 10) / 10,
          lastDate: last.date,
          lastDepthM: last.depthM,
          trend: w.preMonsoonTrendMPerYr,
        };
      }
    }
    sources[s.id] = {
      gwDistrict: gd,
      groundwaterFed: groundwaterFed(s.type),
      block,
      monsoon: climate.data.monsoon?.[s.id] ?? null,
      refWell,
    };
  }

  cached = {
    gwra: {
      title: gwra.title,
      publisher: gwra.publisher,
      url: gwra.url,
      retrieved: gwra.retrieved,
      specificYield: gwra.specificYield,
      districts,
      blocks,
    },
    wells: {
      title: wells.title,
      publisher: wells.publisher,
      url: wells.url,
      retrieved: wells.retrieved,
      list: wells.wells.map((w) => ({
        code: w.code,
        name: w.name,
        lat: w.lat,
        lon: w.lon,
        wellType: w.wellType,
        wellDepthM: w.wellDepthM,
        nearestSourceId: w.nearestSourceId,
        nearestKm: w.nearestKm,
        readings: w.readings,
        preMonsoonTrendMPerYr: w.preMonsoonTrendMPerYr,
      })),
    },
    waterBodies: {
      title: water.title,
      source: water.source,
      retrieved: water.retrieved,
      method: water.method,
      list: water.bodies,
    },
    climate:
      climate.provenance === "REAL"
        ? {
            source: climate.source,
            segments: climate.data.segments ?? [],
            normal: climate.data.monsoonNormal?.kind ?? null,
          }
        : null,
    sources,
  };
  return cached;
}
