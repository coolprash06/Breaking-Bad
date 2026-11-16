/**
 * REAL: CGWB observation wells (manual depth-to-water measurements, ~4 a year)
 * from the India Data Portal mirror of India-WRIS ("Groundwater Level Collected
 * Manually", source: Ministry of Jal Shakti / CGWB). Queried with CKAN datastore SQL.
 */
import type { CgwbWell } from "../../src/lib/real/types";
import type { DistrictId } from "../../src/lib/types";

export const IDP_BASE = "https://ckandev.indiadataportal.com";
export const IDP_RESOURCE = "06d6e79c-61ac-46bb-9e03-c7138911c619";
export const IDP_DATASET_URL = `${IDP_BASE}/dataset/groundwater-level`;

interface SourceRef {
  id: string;
  district: DistrictId;
  lat: number;
  lon: number;
}

async function sql<T>(query: string): Promise<T[]> {
  const url = `${IDP_BASE}/api/3/action/datastore_search_sql?sql=${encodeURIComponent(query)}`;
  for (let k = 0; k < 3; k++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "WellCast-hackathon/1.0 (data fetch script)" } });
      const json = (await res.json()) as { success: boolean; result?: { records: T[] }; error?: unknown };
      if (!json.success || !json.result) throw new Error(`IDP SQL failed: ${JSON.stringify(json.error).slice(0, 300)}`);
      return json.result.records;
    } catch (e) {
      if (k === 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (k + 1)));
    }
  }
  return [];
}

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Least-squares slope of pre-monsoon (Mar-Jun) depth against time, m/yr. */
export function preMonsoonTrend(readings: { date: string; depthM: number }[]): number | null {
  const pts = readings
    .filter((r) => {
      const m = Number(r.date.slice(5, 7));
      return m >= 3 && m <= 6;
    })
    .map((r) => ({ x: Date.parse(r.date) / (365.25 * 86_400_000), y: r.depthM }));
  if (pts.length < 5) return null;
  const span = pts[pts.length - 1].x - pts[0].x;
  if (span < 4) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  return sxx > 0 ? Math.round((sxy / sxx) * 1000) / 1000 : null;
}

interface StationRow {
  station_code: string;
  station_name: string;
  latitude: number;
  longitude: number;
  well_type: string | null;
  well_aquifer_type: string | null;
  well_depth: number | null;
  n: number;
  first: string;
  last: string;
}

/**
 * Pick reference wells: per app district, the CGWB stations closest to that district's
 * sources that have a long, recent record (>= 20 readings since 2014, last one 2022 or later).
 */
export async function fetchCgwbWells(
  sources: SourceRef[],
  perDistrict: number,
  log: (s: string) => void,
): Promise<{ wells: CgwbWell[]; candidates: number }> {
  const lats = sources.map((s) => s.lat);
  const lons = sources.map((s) => s.lon);
  const box = {
    s: Math.min(...lats) - 0.5,
    n: Math.max(...lats) + 0.5,
    w: Math.min(...lons) - 0.5,
    e: Math.max(...lons) + 0.5,
  };
  log(`IDP: CGWB manual stations in lat ${box.s.toFixed(1)}..${box.n.toFixed(1)}, lon ${box.w.toFixed(1)}..${box.e.toFixed(1)}`);
  const stations = await sql<StationRow>(
    `SELECT station_code, station_name, latitude, longitude, well_type, well_aquifer_type, well_depth,
            count(*) AS n, min(date) AS first, max(date) AS last
       FROM "${IDP_RESOURCE}"
      WHERE agency_name = 'CGWB' AND data_type_description = 'MANUAL-Water Level'
        AND latitude BETWEEN ${box.s} AND ${box.n} AND longitude BETWEEN ${box.w} AND ${box.e}
        AND date >= '2014-01-01' AND data_value IS NOT NULL
      GROUP BY station_code, station_name, latitude, longitude, well_type, well_aquifer_type, well_depth`,
  );
  const good = stations.filter((s) => Number(s.n) >= 20 && String(s.last) >= "2022-01-01");
  log(`IDP: ${stations.length} stations, ${good.length} with a long recent record`);

  const districts = [...new Set(sources.map((s) => s.district))];
  const chosen = new Map<string, { st: StationRow; near: DistrictId; src: SourceRef; d: number }>();
  for (const d of districts) {
    const mine = sources.filter((s) => s.district === d);
    const ranked = good
      .filter((st) => !chosen.has(st.station_code))
      .map((st) => {
        let best = { src: mine[0], d: Infinity };
        for (const src of mine) {
          const dist = km({ lat: st.latitude, lon: st.longitude }, src);
          if (dist < best.d) best = { src, d: dist };
        }
        return { st, ...best };
      })
      .filter((r) => r.d <= 40)
      .sort((a, b) => a.d - b.d)
      .slice(0, perDistrict);
    for (const r of ranked) chosen.set(r.st.station_code, { st: r.st, near: d, src: r.src, d: r.d });
  }
  if (chosen.size === 0) return { wells: [], candidates: good.length };

  const codes = [...chosen.keys()].map((c) => `'${c.replace(/'/g, "''")}'`).join(",");
  const rows = await sql<{ station_code: string; date: string; data_value: number }>(
    `SELECT station_code, date, data_value FROM "${IDP_RESOURCE}"
      WHERE station_code IN (${codes}) AND data_type_description = 'MANUAL-Water Level'
        AND date >= '2014-01-01' AND data_value IS NOT NULL ORDER BY station_code, date`,
  );

  const wells: CgwbWell[] = [];
  for (const [code, c] of chosen) {
    const readings = rows
      .filter((r) => r.station_code === code)
      .map((r) => ({ date: String(r.date).slice(0, 10), depthM: Math.round(Number(r.data_value) * 100) / 100 }))
      .filter((r) => Number.isFinite(r.depthM) && r.depthM >= 0);
    wells.push({
      code,
      name: c.st.station_name,
      lat: c.st.latitude,
      lon: c.st.longitude,
      wellType: c.st.well_type,
      aquifer: c.st.well_aquifer_type,
      wellDepthM: c.st.well_depth === null ? null : Number(c.st.well_depth),
      near: c.near,
      nearestSourceId: c.src.id,
      nearestKm: Math.round(c.d * 10) / 10,
      readings,
      preMonsoonTrendMPerYr: preMonsoonTrend(readings),
    });
  }
  return { wells, candidates: good.length };
}
