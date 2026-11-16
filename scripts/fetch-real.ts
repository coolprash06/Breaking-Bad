/**
 * Downloads and caches REAL public data as JSON in data/real/, so the app never
 * calls external APIs at runtime and the demo works offline.
 *
 * Usage: npm run fetch-real            (everything)
 *        npm run fetch-real -- climate (one part: gwra | wells | climate)
 *
 * Then run `npm run generate` so the simulated village-source levels are driven by
 * the real rainfall / evaporation and the real district groundwater decline.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SOURCE_SPECS } from "../src/lib/sim/specs";
import { buildTimeline } from "../src/lib/sim/generator";
import { DISTRICT_IDS } from "../src/config/regions";
import type { ClimateData, Dataset, DistrictClimate, DistrictId } from "../src/lib/types";
import type { CgwbWellsData, GwraBlock, GwraData, GwraDistrictKey } from "../src/lib/real/types";
import { readPdf } from "./real/pdfText";
import { GWRA_URL, parseGwra, SPECIFIC_YIELD } from "./real/gwra";
import { fetchMonsoonNormal, fetchOpenMeteo } from "./real/openMeteo";
import { fetchCgwbWells, IDP_DATASET_URL } from "./real/cgwbWells";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "real");
const CACHE = path.join(OUT, "cache");
mkdirSync(CACHE, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const log = (s: string) => console.log(`  ${s}`);
const write = (name: string, value: unknown, pretty = true) => {
  const file = path.join(OUT, name);
  writeFileSync(file, JSON.stringify(value, null, pretty ? 1 : undefined) + "\n");
  console.log(`wrote ${path.relative(ROOT, file)}`);
};

async function download(url: string, file: string): Promise<Uint8Array> {
  if (existsSync(file)) {
    log(`cached ${path.relative(ROOT, file)}`);
    return new Uint8Array(readFileSync(file));
  }
  log(`downloading ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (WellCast hackathon data fetch)" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

// ------------------------------------------------------------------ GWRA 2025

/** Approximate district centres, used only to pick the right town when geocoding a block. */
const GWRA_CENTRE: Record<GwraDistrictKey, { lat: number; lon: number }> = {
  barmer: { lat: 25.75, lon: 71.39 },
  jaisalmer: { lat: 26.91, lon: 70.91 },
  bikaner: { lat: 28.02, lon: 73.31 },
  jodhpur: { lat: 26.75, lon: 72.6 },
  kachchh: { lat: 23.4, lon: 69.8 },
};

/** Known alternative spellings of block HQ towns (as printed -> as in GeoNames). */
const SPELLING: Record<string, string[]> = {
  Baytoo: ["Baytu"],
  Dhanaoo: ["Dhanau"],
  Gira: ["Gida"],
  Gadraroad: ["Gadra Road", "Gadra"],
  Dhorimanna: ["Dhorimana"],
  Serwa: ["Sedwa"],
  Panchoo: ["Panchu"],
  Dungargarh: ["Sri Dungargarh", "Shri Dungargarh"],
  Tiwari: ["Tinwari"],
  Dechoo: ["Dechu"],
  "Mandor (rural)": ["Mandore", "Mandor"],
  Baori: ["Bawri", "Bawdi"],
  "Pipar City": ["Pipar", "Piparcity"],
  Sam: ["Sam Sand Dunes", "Sam"],
  Sindhari: ["Sindari"],
  Luni: ["Luni Junction"],
};

/** GeoNames second-level admin names accepted for each CGWB district (incl. districts split off since 2023). */
const ADMIN2: Record<GwraDistrictKey, string[]> = {
  barmer: ["barmer", "balotra"],
  jaisalmer: ["jaisalmer"],
  bikaner: ["bikaner"],
  jodhpur: ["jodhpur", "phalodi"],
  kachchh: ["kutch", "kachchh"],
};
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

interface GeoHit {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  admin2?: string;
  feature_code?: string;
}

function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dy = (a.lat - b.lat) * 111;
  const dx = (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

async function geocodeBlock(b: GwraBlock, state: string): Promise<GwraBlock["point"]> {
  const base = b.label.replace(/\s*\((rural|urban)\)$/i, "");
  const names = [...(SPELLING[b.label] ?? []), ...(SPELLING[base] ?? []), base];
  const centre = GWRA_CENTRE[b.district];
  for (const name of [...new Set(names)]) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=20&language=en&format=json&countryCode=IN`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const json = (await res.json()) as { results?: GeoHit[] };
    const hits = (json.results ?? [])
      .filter((h) => (h.admin1 ?? "").toLowerCase() === state.toLowerCase())
      .filter((h) => ADMIN2[b.district].some((a) => fold(h.admin2 ?? "").includes(a)))
      .map((h) => ({ h, d: kmBetween({ lat: h.latitude, lon: h.longitude }, centre) }))
      .filter((x) => x.d <= 180)
      .sort((a, b2) => a.d - b2.d);
    if (hits.length) {
      const { h } = hits[0];
      return {
        lat: Math.round(h.latitude * 1e4) / 1e4,
        lon: Math.round(h.longitude * 1e4) / 1e4,
        matched: `${h.name}${h.admin2 ? `, ${h.admin2}` : ""}`,
      };
    }
  }
  return null;
}

async function gwra(): Promise<void> {
  console.log("CGWB GWRA 2025 (National Compilation, Ministry of Jal Shakti)");
  const pdf = await download(GWRA_URL, path.join(CACHE, "gwra-2025.pdf"));
  const pages = await readPdf(pdf);
  const parsed = parseGwra(pages);
  for (const w of parsed.warnings) log(`WARNING ${w}`);

  for (const b of parsed.blocks) {
    const state = parsed.districts[b.district].state;
    b.point = await geocodeBlock(b, state);
    log(`${b.district.padEnd(9)} ${b.name.padEnd(18)} ${b.category.padEnd(14)} ${b.point ? b.point.matched : "NOT GEOCODED"}`);
  }

  const data: GwraData = {
    title: "National Compilation on Dynamic Ground Water Resources of India, 2025",
    publisher: "Central Ground Water Board (CGWB), Department of Water Resources, RD & GR, Ministry of Jal Shakti, Government of India",
    url: GWRA_URL,
    published: "2025-11",
    retrieved: today,
    specificYield: SPECIFIC_YIELD,
    districts: parsed.districts,
    blocks: parsed.blocks,
    notes: [
      "District figures: table 'Ground water resources availability, utilization and stage of extraction (as in 2025)'. Volumes in hectare-metres (ham); 1 ham = 10,000 m3.",
      "Block categories: chapter 'Categorization of assessment units, 2025' (semi-critical, critical, over-exploited are named; Safe units are only counted) and the national list of Saline assessment units.",
      "Block stage of extraction (%) is printed only for blocks whose category changed between 2024 and 2025.",
      "Phalodi became a district in 2023; GWRA 2025 still reports the Phalodi block under Jodhpur district.",
      `impliedDeclineMPerYr = max(0, extraction - extractable resource) / (recharge-worthy area x specific yield ${SPECIFIC_YIELD}). The specific yield is our assumption, not a CGWB figure.`,
      "Block points are block HQ towns geocoded with the Open-Meteo geocoding API (GeoNames, CC BY 4.0), not block boundaries.",
    ],
  };
  write("gwra-2025.json", data);
}

// ------------------------------------------------------------------ CGWB wells

async function wells(): Promise<void> {
  console.log("CGWB observation wells (India Data Portal / India-WRIS)");
  const { wells: list, candidates } = await fetchCgwbWells(
    SOURCE_SPECS.map((s) => ({ id: s.id, district: s.district, lat: s.lat, lon: s.lon })),
    2,
    log,
  );
  for (const w of list) {
    const last = w.readings[w.readings.length - 1];
    log(
      `${w.near.padEnd(9)} ${w.name.padEnd(24)} ${w.readings.length} readings, last ${last?.date} ${last?.depthM} m, trend ${w.preMonsoonTrendMPerYr ?? "n/a"} m/yr, ${w.nearestKm} km from ${w.nearestSourceId}`,
    );
  }
  const data: CgwbWellsData = {
    title: "Groundwater Level Collected Manually (CGWB observation wells)",
    publisher: "Central Ground Water Board, Ministry of Jal Shakti, via India-WRIS; mirrored by the India Data Portal (ISB / Bharti Institute)",
    url: IDP_DATASET_URL,
    retrieved: today,
    wells: list,
    notes: [
      "Depth to water below ground level (m), measured manually about four times a year (Jan, Apr/May, Aug, Nov).",
      `Selection: CGWB stations with >= 20 readings since 2014 and a reading in 2022 or later, the 2 closest (within 40 km) to each district's sources. ${candidates} stations qualified in the region.`,
      "The latest measurements in the mirror are from January 2024; later CGWB data is on India-WRIS.",
      "Pre-monsoon trend: least-squares slope of Mar-Jun depths; positive = water table falling.",
    ],
  };
  write("cgwb-wells.json", data);
}

// ------------------------------------------------------------------ Climate

function mean(arrs: number[][], i: number): number {
  return arrs.reduce((s, a) => s + a[i], 0) / arrs.length;
}

async function climate(): Promise<void> {
  console.log("Open-Meteo: ERA5 + recent days + forecast at every source");
  const tl = buildTimeline();
  const pts = SOURCE_SPECS.map((s) => ({ lat: s.lat, lon: s.lon }));
  const { result, raw } = await fetchOpenMeteo(pts, tl, log);
  writeFileSync(path.join(CACHE, "open-meteo-raw.json"), JSON.stringify(raw));

  const sources: Record<string, DistrictClimate> = {};
  SOURCE_SPECS.forEach((s, p) => (sources[s.id] = result.points[p]));

  // District series = mean of that district's sources (kept for the district-level views).
  const districts = {} as Record<DistrictId, DistrictClimate>;
  for (const d of DISTRICT_IDS) {
    const mine = SOURCE_SPECS.map((s, p) => ({ s, p })).filter((x) => x.s.district === d).map((x) => result.points[x.p]);
    const r1 = (x: number) => Math.round(x * 10) / 10;
    districts[d] = {
      rainMm: mine[0].rainMm.map((_, i) => r1(mean(mine.map((m) => m.rainMm), i))),
      tmaxC: mine[0].tmaxC.map((_, i) => r1(mean(mine.map((m) => m.tmaxC), i))),
      tminC: mine[0].tminC.map((_, i) => r1(mean(mine.map((m) => m.tminC), i))),
      petMm: mine[0].petMm.map((_, i) => Math.round(mean(mine.map((m) => m.petMm), i) * 100) / 100),
    };
  }

  // Monsoon 2026 vs the ERA5 1991-2020 normal (June-September), per source.
  log("Open-Meteo ERA5 June-September totals 1991-2020 and 2026 (normal)");
  const normal = await fetchMonsoonNormal(pts, 1991, 2020);
  const y2026 = await fetchMonsoonNormal(pts, 2026, 2026);
  const monsoon: NonNullable<ClimateData["monsoon"]> = {};
  SOURCE_SPECS.forEach((s, p) => {
    const years = Object.values(normal.perYear).map((v) => v[p]);
    const norm = years.reduce((a, b) => a + b, 0) / years.length;
    const actual = y2026.perYear[2026]?.[p] ?? 0;
    monsoon[s.id] = {
      year: 2026,
      actualMm: Math.round(actual),
      normalMm: Math.round(norm),
      departurePct: norm > 0 ? Math.round((100 * (actual - norm)) / norm) : 0,
    };
  });

  const seg = result.segments.map((s) => `${s.origin} ${s.from}..${s.to}`).join("; ");
  log(`segments: ${seg}`);
  const ds: Dataset<ClimateData> = {
    id: "climate",
    provenance: "REAL",
    title: "Rainfall, temperature and evaporation",
    source: "ERA5 (Copernicus / ECMWF) via the Open-Meteo historical archive; recent days from the Open-Meteo forecast API. CC BY 4.0.",
    note: `Daily at each source's coordinates (ERA5 ~0.25 deg grid). Evaporation = FAO-56 reference evapotranspiration. Retrieved ${today}. Segments: ${seg}. Future days are revealed only by the demo clock: 16-day forecast, then the same dates one year earlier (ERA5 analogue).`,
    data: {
      start: tl.start,
      districts,
      sources,
      origin: result.origin,
      segments: result.segments,
      monsoon,
      monsoonNormal: { kind: "ERA5 1991-2020 June-September mean", months: "Jun-Sep" },
    },
  };
  write("climate.json", ds, false);
}

// ------------------------------------------------------------------ main

const PARTS: Record<string, () => Promise<void>> = { gwra, wells, climate };

(async () => {
  const want = process.argv.slice(2).filter((a) => PARTS[a]);
  const run = want.length ? want : Object.keys(PARTS);
  for (const p of run) {
    try {
      await PARTS[p]();
    } catch (e) {
      console.error(`\nFAILED: ${p}: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
  console.log("\nNext: npm run generate   (re-drives the simulated village sources with this real data)");
})();
