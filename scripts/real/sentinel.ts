/**
 * REAL: Copernicus Sentinel-2 L2A via Microsoft Planetary Computer (no account needed).
 *
 * Nothing is downloaded as imagery: the Planetary Computer Data API computes
 * statistics over a small polygon server-side, so each request returns ~1 KB.
 *  - Cloud check: the scene classification layer (SCL) inside the polygon.
 *    Cloud = classes 3 (cloud shadow), 8, 9 (cloud medium / high probability), 10 (thin cirrus).
 *  - NDVI = (B08 - B04) / (B08 + B04), NDWI (McFeeters) = (B03 - B08) / (B03 + B08),
 *    on surface reflectance. Processing baseline >= 04.00 stores DN = reflectance x 10000 + 1000,
 *    so the 1000 offset is removed in the expression.
 * Results are cached per request in data/real/cache/, so re-runs only fetch new scenes.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const DATA = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics";
const COLLECTION = "sentinel-2-l2a";

export const CLOUD_CLASSES = [3, 8, 9, 10];
/** A scene is "cloudy" at a place when more than this share of its pixels there is cloud. */
export const MAX_CLOUD_FRACTION = 0.1;

export interface S2Item {
  id: string;
  date: string;
  cloudCover: number;
  baseline: string;
}

type Feature = { type: "Feature"; properties: Record<string, never>; geometry: { type: "Polygon"; coordinates: number[][][] } };

/** Circle (polygon with 24 vertices) of radius r metres around a point. */
export function circle(lat: number, lon: number, r: number): Feature {
  const dLat = r / 111_320;
  const dLon = r / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * 2 * Math.PI;
    ring.push([Math.round((lon + dLon * Math.cos(a)) * 1e6) / 1e6, Math.round((lat + dLat * Math.sin(a)) * 1e6) / 1e6]);
  }
  ring.push(ring[0]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

async function post<T>(url: string, body: unknown, tries = 4): Promise<T> {
  let last: unknown;
  for (let k = 0; k < tries; k++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "WellCast-hackathon/1.0 (data fetch script)" },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as T;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** k));
    }
  }
  throw last;
}

/** All Sentinel-2 L2A scenes over a point in [from, to], one per date (least cloudy tile). */
export async function searchScenes(lat: number, lon: number, from: string, to: string): Promise<S2Item[]> {
  type Resp = {
    features: { id: string; properties: Record<string, unknown> }[];
    links?: { rel: string; body?: unknown; href: string }[];
  };
  let body: Record<string, unknown> = {
    collections: [COLLECTION],
    intersects: { type: "Point", coordinates: [lon, lat] },
    datetime: `${from}T00:00:00Z/${to}T23:59:59Z`,
    limit: 250,
    fields: {
      include: ["id", "properties.datetime", "properties.eo:cloud_cover", "properties.s2:processing_baseline"],
      exclude: ["assets", "links", "geometry"],
    },
  };
  const all: S2Item[] = [];
  for (let page = 0; page < 10; page++) {
    const r = await post<Resp>(STAC, body);
    for (const f of r.features) {
      all.push({
        id: f.id,
        date: String(f.properties.datetime).slice(0, 10),
        cloudCover: Number(f.properties["eo:cloud_cover"] ?? 0),
        baseline: String(f.properties["s2:processing_baseline"] ?? "05.00"),
      });
    }
    const next = r.links?.find((l) => l.rel === "next");
    if (!next?.body) break;
    body = next.body as Record<string, unknown>;
  }
  const byDate = new Map<string, S2Item>();
  for (const it of all) {
    const prev = byDate.get(it.date);
    if (!prev || it.cloudCover < prev.cloudCover) byDate.set(it.date, it);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------- cached statistics

export class StatsCache {
  private data: Record<string, unknown>;
  private dirty = 0;
  constructor(private file: string) {
    this.data = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
  }
  get<T>(k: string): T | undefined {
    return this.data[k] as T | undefined;
  }
  set(k: string, v: unknown) {
    this.data[k] = v;
    if (++this.dirty >= 50) this.save();
  }
  save() {
    writeFileSync(this.file, JSON.stringify(this.data));
    this.dirty = 0;
  }
}

interface StatsResp {
  properties: { statistics: Record<string, { mean: number; count: number; histogram: [number[], number[]] }> };
}

const offset = (baseline: string) => (Number(baseline) >= 4 ? 1000 : 0);

/** Share of cloud pixels (SCL) inside the polygon, and the number of valid pixels. */
export async function cloudFraction(cache: StatsCache, item: S2Item, key: string, f: Feature): Promise<{ cloud: number; valid: number }> {
  const k = `scl|${item.id}|${key}`;
  const hit = cache.get<{ cloud: number; valid: number }>(k);
  if (hit) return hit;
  const r = await post<StatsResp>(`${DATA}?collection=${COLLECTION}&item=${item.id}&assets=SCL&categorical=true`, f);
  const s = Object.values(r.properties.statistics)[0];
  const [counts, classes] = s?.histogram ?? [[], []];
  let valid = 0;
  let cloud = 0;
  classes.forEach((c, i) => {
    if (c === 0) return; // no data
    valid += counts[i];
    if (CLOUD_CLASSES.includes(c)) cloud += counts[i];
  });
  const out = { cloud: valid > 0 ? cloud / valid : 1, valid };
  cache.set(k, out);
  return out;
}

/** Mean NDVI inside the polygon. */
export async function meanNdvi(cache: StatsCache, item: S2Item, key: string, f: Feature): Promise<number | null> {
  const k = `ndvi|${item.id}|${key}`;
  const hit = cache.get<number | null>(k);
  if (hit !== undefined) return hit;
  const o = offset(item.baseline);
  const expr = o ? `(B08-B04)/(B08+B04-${2 * o})` : "(B08-B04)/(B08+B04)";
  const r = await post<StatsResp>(
    `${DATA}?collection=${COLLECTION}&item=${item.id}&expression=${encodeURIComponent(expr)}&asset_as_band=true`,
    f,
  );
  const s = Object.values(r.properties.statistics)[0];
  const v = s && Number.isFinite(s.mean) && s.count > 0 ? Math.round(s.mean * 1000) / 1000 : null;
  cache.set(k, v);
  return v;
}

/** Number of water pixels (NDWI > 0, 10 m) inside the polygon and the number of valid pixels. */
export async function waterPixels(cache: StatsCache, item: S2Item, key: string, f: Feature): Promise<{ water: number; valid: number }> {
  const k = `ndwi|${item.id}|${key}`;
  const hit = cache.get<{ water: number; valid: number }>(k);
  if (hit) return hit;
  const o = offset(item.baseline);
  const expr = o ? `(B03-B08)/(B03+B08-${2 * o})` : "(B03-B08)/(B03+B08)";
  const r = await post<StatsResp>(
    `${DATA}?collection=${COLLECTION}&item=${item.id}&expression=${encodeURIComponent(expr)}&asset_as_band=true&histogram_bins=2&histogram_range=-1,1`,
    f,
  );
  const s = Object.values(r.properties.statistics)[0];
  const [counts] = s?.histogram ?? [[0, 0]];
  const out = { water: counts[1] ?? 0, valid: s?.count ?? 0 };
  cache.set(k, out);
  return out;
}

/** Run async jobs with a fixed concurrency. */
export async function pool<T>(jobs: (() => Promise<T>)[], n: number, onDone?: (done: number) => void): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await jobs[i]();
      done++;
      onDone?.(done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, worker));
  return out;
}
