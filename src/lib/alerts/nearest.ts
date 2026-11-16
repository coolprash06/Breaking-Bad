/**
 * "Nearest safe source" (F5). Pure functions, safe to use on server and client.
 * Distances are straight-line (haversine) between the source coordinates.
 */
import type { WaterSource } from "@/lib/types";
import type { DisplayTier } from "./tiers";
import type { SourceNeed } from "@/config/personas";
import { SOURCE_TYPES } from "@/config/sourceTypes";

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Can this source serve this need at all (ignoring its current risk)? */
export function isSuitable(source: WaterSource, need: SourceNeed): boolean {
  switch (need) {
    case "drink":
      // A drinkable type that people already draw from (not a private farm borewell).
      return SOURCE_TYPES[source.type].drinkable && source.usedBy.includes("fetch");
    case "animals":
      return source.animalCapable;
    case "onspot":
      return source.usedBy.includes("spot");
    case "none":
      return false;
  }
}

export interface Candidate {
  source: WaterSource;
  tier: DisplayTier;
}

export interface Alternative {
  source: WaterSource;
  km: number;
}

export interface NearestResult {
  /** Closest suitable Safe source within maxKm, or null. */
  within: Alternative | null;
  /** Closest suitable Safe source at any distance (to state honestly how far it is). */
  closest: Alternative | null;
}

/**
 * Only Safe sources are suggested. Grey (no data) is never suggested, because we
 * cannot vouch for it.
 */
export function nearestSafe(from: WaterSource, all: Candidate[], need: SourceNeed, maxKm: number): NearestResult {
  if (need === "none") return { within: null, closest: null };
  let closest: Alternative | null = null;
  for (const c of all) {
    if (c.source.id === from.id || c.tier !== "safe" || !isSuitable(c.source, need)) continue;
    const km = haversineKm(from, c.source);
    if (!closest || km < closest.km) closest = { source: c.source, km };
  }
  return { within: closest && closest.km <= maxKm ? closest : null, closest };
}

/** "2 km", "12 km", "0.6 km" */
export function formatKm(km: number): string {
  return km < 1 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
