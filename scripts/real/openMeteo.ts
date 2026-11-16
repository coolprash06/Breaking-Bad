/**
 * REAL: daily rainfall, temperature and reference evapotranspiration at every source,
 * from Open-Meteo (free, no key; data CC BY 4.0).
 *
 *  1. ERA5 reanalysis (Copernicus / ECMWF) via the Open-Meteo historical archive,
 *     from the timeline start until ERA5's ~5-day publication lag.
 *  2. The last few days before "today" from the Open-Meteo forecast API (past_days),
 *     i.e. the operational ECMWF IFS / best-match analysis.
 *  3. Days after "today" (only revealed by the demo batch clock): Open-Meteo's
 *     16-day forecast, then, past the forecast horizon, the same calendar days one
 *     year earlier from ERA5 (an "analogue year"). Every day is tagged with its origin.
 */
import { addDays, daysBetween } from "../../src/lib/time";

export type DayOrigin = "era5" | "recent" | "forecast" | "analogue";

export interface PointClimate {
  rainMm: number[];
  tmaxC: number[];
  tminC: number[];
  /** FAO-56 Penman-Monteith reference evapotranspiration (mm/day). */
  petMm: number[];
}

export interface OpenMeteoResult {
  points: PointClimate[];
  origin: DayOrigin[];
  segments: { origin: DayOrigin; from: string; to: string }[];
  /** Grid cell centres actually used (ERA5 ~0.25 deg). */
  cells: { lat: number; lon: number }[];
}

const DAILY = "precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration";

interface OmDaily {
  time: string[];
  precipitation_sum: (number | null)[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  et0_fao_evapotranspiration: (number | null)[];
}
interface OmLocation {
  latitude: number;
  longitude: number;
  daily: OmDaily;
}

async function getJson(url: string, tries = 3): Promise<unknown> {
  let last: unknown;
  for (let k = 0; k < tries; k++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "WellCast-hackathon/1.0 (data fetch script)" } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500 * (k + 1)));
    }
  }
  throw last;
}

async function multi(base: string, pts: { lat: number; lon: number }[], extra: string): Promise<OmLocation[]> {
  const lat = pts.map((p) => p.lat.toFixed(4)).join(",");
  const lon = pts.map((p) => p.lon.toFixed(4)).join(",");
  const url = `${base}?latitude=${lat}&longitude=${lon}&daily=${DAILY}&timezone=Asia%2FKolkata&${extra}`;
  const json = await getJson(url);
  return (Array.isArray(json) ? json : [json]) as OmLocation[];
}

/** Index of each date in an Open-Meteo daily block, values per variable. */
function table(loc: OmLocation) {
  const m = new Map<string, [number | null, number | null, number | null, number | null]>();
  loc.daily.time.forEach((d, i) =>
    m.set(d, [
      loc.daily.precipitation_sum[i],
      loc.daily.temperature_2m_max[i],
      loc.daily.temperature_2m_min[i],
      loc.daily.et0_fao_evapotranspiration[i],
    ]),
  );
  return m;
}

const complete = (v: [number | null, number | null, number | null, number | null] | undefined) =>
  !!v && v.every((x) => x !== null && Number.isFinite(x));

export async function fetchOpenMeteo(
  pts: { lat: number; lon: number }[],
  timeline: { start: string; demoDate: string; end: string; days: number },
  log: (s: string) => void,
): Promise<{ result: OpenMeteoResult; raw: Record<string, unknown> }> {
  const { start, demoDate, end, days } = timeline;
  const analogueStart = addDays(start, -366);

  log(`Open-Meteo ERA5 archive ${analogueStart} .. ${demoDate} for ${pts.length} points`);
  const era5 = await multi(
    "https://archive-api.open-meteo.com/v1/archive",
    pts,
    `start_date=${analogueStart}&end_date=${demoDate}&models=era5`,
  );
  log("Open-Meteo forecast API (past_days=14, forecast_days=16)");
  const fc = await multi("https://api.open-meteo.com/v1/forecast", pts, "past_days=14&forecast_days=16");

  const points: PointClimate[] = [];
  const originByPoint: DayOrigin[][] = [];
  for (let p = 0; p < pts.length; p++) {
    const a = table(era5[p]);
    const f = table(fc[p]);
    const out: PointClimate = { rainMm: [], tmaxC: [], tminC: [], petMm: [] };
    const origin: DayOrigin[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      const past = daysBetween(date, demoDate) >= 0;
      let v = a.get(date);
      let o: DayOrigin = "era5";
      if (!complete(v)) {
        v = f.get(date);
        o = past ? "recent" : "forecast";
      }
      if (!complete(v)) {
        // Beyond the forecast horizon: same calendar day one year earlier (ERA5).
        v = a.get(addDays(date, -365));
        o = "analogue";
      }
      if (!complete(v)) throw new Error(`Open-Meteo: no data for point ${p} on ${date}`);
      const [r, tx, tn, et] = v as number[];
      out.rainMm.push(Math.round(r * 10) / 10);
      out.tmaxC.push(Math.round(tx * 10) / 10);
      out.tminC.push(Math.round(tn * 10) / 10);
      out.petMm.push(Math.round(et * 100) / 100);
      origin.push(o);
    }
    points.push(out);
    originByPoint.push(origin);
  }

  // All points share the same origin pattern in practice; keep the most conservative.
  const rank: Record<DayOrigin, number> = { era5: 0, recent: 1, forecast: 2, analogue: 3 };
  const origin: DayOrigin[] = Array.from({ length: days }, (_, i) =>
    originByPoint.reduce<DayOrigin>((acc, o) => (rank[o[i]] > rank[acc] ? o[i] : acc), "era5"),
  );
  const segments: OpenMeteoResult["segments"] = [];
  origin.forEach((o, i) => {
    const date = addDays(start, i);
    const last = segments[segments.length - 1];
    if (last && last.origin === o) last.to = date;
    else segments.push({ origin: o, from: date, to: date });
  });
  if (daysBetween(segments[segments.length - 1].to, end) !== 0) throw new Error("Open-Meteo: timeline not covered");

  return {
    result: { points, origin, segments, cells: era5.map((l) => ({ lat: l.latitude, lon: l.longitude })) },
    raw: { era5, forecast: fc },
  };
}

/**
 * Long-term rainfall normal from ERA5 at a set of points: mean June-September total
 * over `fromYear..toYear` (used for "monsoon X% below normal").
 */
export async function fetchMonsoonNormal(
  pts: { lat: number; lon: number }[],
  fromYear: number,
  toYear: number,
): Promise<{ perYear: Record<number, number[]> }> {
  const lat = pts.map((p) => p.lat.toFixed(4)).join(",");
  const lon = pts.map((p) => p.lon.toFixed(4)).join(",");
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum&timezone=Asia%2FKolkata&start_date=${fromYear}-06-01&end_date=${toYear}-09-30&models=era5`;
  const json = await getJson(url);
  const locs = (Array.isArray(json) ? json : [json]) as { daily: { time: string[]; precipitation_sum: (number | null)[] } }[];
  const perYear: Record<number, number[]> = {};
  locs.forEach((loc, p) => {
    loc.daily.time.forEach((d, i) => {
      const y = Number(d.slice(0, 4));
      const m = Number(d.slice(5, 7));
      if (m < 6 || m > 9) return;
      perYear[y] ??= pts.map(() => 0);
      perYear[y][p] += loc.daily.precipitation_sum[i] ?? 0;
    });
  });
  return { perYear };
}
