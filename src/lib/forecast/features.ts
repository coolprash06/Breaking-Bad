/**
 * Daily driver features for one source, built only from data known on the
 * snapshot date: rain (same-day or infiltration-lagged by source type), PET,
 * and reported usage per persona category.
 */
import type { DataSnapshot } from "@/lib/data/store";
import type { UsageCategory, WaterSource } from "@/lib/types";
import { laggedRain } from "@/lib/data/series";
import { GROUNDWATER_RAIN_LAG_DAYS } from "@/config/thresholds";

export interface DailyFeatures {
  /** Rain that drives recharge for this source type (mm/day). */
  rechargeRain: number[];
  /** Raw district rain (mm/day), for rain-deficit signals and climatology. */
  rain: number[];
  pet: number[];
  usage: Record<UsageCategory, number[]>;
  /** True when rain reaches this source through the ground (lagged). */
  lagged: boolean;
}

export function isGroundwaterLagged(source: WaterSource): boolean {
  return source.type === "dug_well" || source.type === "stepwell";
}

export function buildFeatures(snap: DataSnapshot, source: WaterSource): DailyFeatures {
  const clim = snap.climate.data.districts[source.district];
  const lagged = isGroundwaterLagged(source);
  const u = snap.usage.data.series[source.id];
  return {
    rechargeRain: lagged ? laggedRain(clim.rainMm, GROUNDWATER_RAIN_LAG_DAYS) : clim.rainMm,
    rain: clim.rainMm,
    pet: clim.petMm,
    usage: { fetch: u.fetch, spot: u.spot, pump: u.pump },
    lagged,
  };
}
