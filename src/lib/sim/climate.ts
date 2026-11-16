/**
 * SIMULATED daily climate per district: a stand-in for REAL CHIRPS / IMD rainfall.
 *
 * Realism rules (PRD Section 7):
 *  - Monsoon rain only between onset and withdrawal; 2026 is a deficit year
 *    with an early withdrawal (no rain since early September).
 *  - Rare winter rain (one western-disturbance shower over Thar in January).
 *  - Heat peaks in May; PET follows temperature, so open water drops faster in summer.
 */
import { DISTRICTS, DISTRICT_IDS } from "@/config/regions";
import type { ClimateData, DistrictClimate, DistrictId, Region, Timeline } from "@/lib/types";
import { addDays, dayOfYear, toUtcMs } from "@/lib/time";
import { rngFor } from "./prng";

const MONSOON: Record<Region, { onset: string; withdrawal: string }> = {
  thar: { onset: "2026-07-01", withdrawal: "2026-09-03" },
  kutch: { onset: "2026-06-25", withdrawal: "2026-09-06" },
};

/** Relative rainfall of each district (Kutch slightly wetter than west Thar). */
const RAIN_SCALE: Record<DistrictId, number> = {
  jaisalmer: 0.8,
  barmer: 1.0,
  bikaner: 1.0,
  phalodi: 0.9,
  bhuj: 1.2,
  rapar: 1.3,
  banni: 1.0,
  lakhpat: 0.9,
};

/** Rare winter showers (date, mm range) per region. */
const WINTER_SHOWERS: { region: Region; date: string; min: number; max: number }[] = [
  { region: "thar", date: "2026-01-22", min: 6, max: 10 },
  { region: "kutch", date: "2026-02-03", min: 2, max: 5 },
];

const TEMP_OFFSET: Record<Region, number> = { thar: 1, kutch: -1 };

/** Hargreaves-style PET (mm/day) with a simple seasonal radiation term. */
export function hargreavesPet(tmax: number, tmin: number, doy: number): number {
  const ra = 12.5 + 3.5 * Math.cos((2 * Math.PI * (doy - 172)) / 365);
  const tmean = (tmax + tmin) / 2;
  return Math.max(0.5, 0.0023 * ra * (tmean + 17.8) * Math.sqrt(Math.max(1, tmax - tmin)));
}

function inRange(date: string, from: string, to: string): boolean {
  const t = toUtcMs(date);
  return t >= toUtcMs(from) && t <= toUtcMs(to);
}

export function generateClimate(timeline: Timeline, seed: number): ClimateData {
  const regions: Region[] = ["thar", "kutch"];
  const regionalWet: Record<Region, boolean[]> = { thar: [], kutch: [] };

  // 1) Region-wide wet days (spatially correlated rain).
  for (const region of regions) {
    const rng = rngFor(seed, `climate:region:${region}`);
    const { onset, withdrawal } = MONSOON[region];
    const span = (toUtcMs(withdrawal) - toUtcMs(onset)) / 86_400_000;
    for (let i = 0; i < timeline.days; i++) {
      const date = addDays(timeline.start, i);
      let p: number;
      if (inRange(date, onset, withdrawal)) {
        const phase = (toUtcMs(date) - toUtcMs(onset)) / 86_400_000 / span;
        p = 0.32 * (0.35 + 0.65 * Math.sin(Math.PI * phase));
      } else if (toUtcMs(date) > toUtcMs(withdrawal)) {
        p = 0; // deficit year: dry since the early withdrawal
      } else {
        p = 0.004; // rare dry-season showers
      }
      regionalWet[region].push(rng.bernoulli(p));
    }
  }

  // 2) Per-district amounts, temperature and PET.
  const districts = {} as Record<DistrictId, DistrictClimate>;
  for (const id of DISTRICT_IDS) {
    const { region } = DISTRICTS[id];
    const rng = rngFor(seed, `climate:district:${id}`);
    const { onset, withdrawal } = MONSOON[region];
    const out: DistrictClimate = { rainMm: [], tmaxC: [], tminC: [], petMm: [] };

    for (let i = 0; i < timeline.days; i++) {
      const date = addDays(timeline.start, i);
      const doy = dayOfYear(date);
      const monsoon = inRange(date, onset, withdrawal);

      let rain = 0;
      if (regionalWet[region][i] && rng.bernoulli(monsoon ? 0.75 : 0.6)) {
        rain = rng.exponential(monsoon ? 11 * RAIN_SCALE[id] : 4);
      }
      for (const s of WINTER_SHOWERS) {
        if (s.region === region && s.date === date) rain = rng.uniform(s.min, s.max);
      }

      const tmax =
        33 +
        9 * Math.cos((2 * Math.PI * (doy - 135)) / 365) +
        TEMP_OFFSET[region] -
        (monsoon ? 3 : 0) -
        (rain > 5 ? 2 : 0) +
        rng.normal(0, 1.2);
      const tmin = tmax - (monsoon ? 8 : 13) + rng.normal(0, 1);

      out.rainMm.push(round(rain, 1));
      out.tmaxC.push(round(tmax, 1));
      out.tminC.push(round(tmin, 1));
      out.petMm.push(round(hargreavesPet(tmax, tmin, doy), 2));
    }
    districts[id] = out;
  }

  return { start: timeline.start, districts };
}

export function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
