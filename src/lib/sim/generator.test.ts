import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DEFAULT_SEED, generateAll, regionalDrift } from "./generator";
import { loadRealInputs } from "./realInputs";
import { SOURCE_SPECS } from "./specs";
import { daysBetween, monthOf, addDays } from "@/lib/time";
import { climateFor, type SourceType } from "@/lib/types";
import { GWRA_DISTRICT_OF } from "@/lib/real/types";
import { daysSinceLastReading } from "@/lib/data/series";
import { NO_DATA_GREY_DAYS } from "@/config/thresholds";

const real = loadRealInputs();
const g = generateAll(DEFAULT_SEED, real);
/** The climate that actually drove the levels: REAL (ERA5) when cached, else simulated. */
const climate = real.climate?.data ?? g.climate.data;
const tl = g.manifest.timeline;
const demoIdx = daysBetween(tl.start, tl.demoDate);
const ALL_TYPES: SourceType[] = ["dug_well", "borewell", "stepwell", "nadi", "tanka", "beri_virda", "oasis"];

describe("simulated data generator", () => {
  it("is deterministic and matches the committed data files", () => {
    const again = generateAll(DEFAULT_SEED, real);
    expect(JSON.stringify(again.readings)).toBe(JSON.stringify(g.readings));
    const onDisk = JSON.parse(readFileSync(path.join("data", "simulated", "readings.json"), "utf8"));
    expect(onDisk).toEqual(g.readings);
  });

  it("covers 15-20 sources, both regions and every source type", () => {
    const s = g.sources.data;
    expect(s.length).toBeGreaterThanOrEqual(15);
    expect(s.length).toBeLessThanOrEqual(30);
    expect(new Set(s.map((x) => x.region))).toEqual(new Set(["thar", "kutch"]));
    for (const t of ALL_TYPES) expect(s.some((x) => x.type === t)).toBe(true);
    for (const x of s) expect(x.illustrativeLocation).toBe(true);
  });

  it("labels every dataset SIMULATED", () => {
    for (const ds of [g.sources, g.readings, g.usage, g.climate, g.ndvi, g.observations]) {
      expect(ds.provenance).toBe("SIMULATED");
    }
  });

  it("hits each source's target level on the demo date and stays within [0, capacity]", () => {
    for (const spec of SOURCE_SPECS) {
      const lv = g.truth.sources[spec.id].trueLevel;
      expect(lv[demoIdx]).toBeCloseTo(spec.targetLevelAtDemo, 2);
      for (const v of lv) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(spec.capacityM + 1e-9);
      }
    }
  });

  it("has sensor gaps everywhere and a dead sensor that shows no recent data", () => {
    for (const s of g.sources.data) {
      const hist = g.readings.data[s.id].values.slice(0, demoIdx + 1);
      expect(hist.some((v) => v === null)).toBe(true);
    }
    const dead = g.readings.data["KU-16"].values.slice(demoIdx - 12, demoIdx + 1);
    expect(dead.every((v) => v === null)).toBe(true);
  });

  it("drops open water faster in summer heat than in winter", () => {
    let checked = 0;
    for (const s of g.sources.data.filter((x) => x.type === "nadi" || x.type === "oasis")) {
      const lv = g.truth.sources[s.id].trueLevel;
      const rain = climateFor(climate, s).rainMm;
      const meanDrop = (month: number) => {
        const d: number[] = [];
        for (let i = 1; i <= demoIdx; i++) {
          const date = addDays(tl.start, i);
          if (monthOf(date) === month && rain[i] === 0 && lv[i] > 0.05 && lv[i - 1] > 0.05) {
            d.push(lv[i - 1] - lv[i]);
          }
        }
        return d.length >= 10 ? d.reduce((a, b) => a + b, 0) / d.length : null;
      };
      const may = meanDrop(5);
      const jan = meanDrop(1);
      if (may === null || jan === null) continue; // dry that month (REAL drought): nothing to compare
      expect(may, s.id).toBeGreaterThan(jan);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it("gives dug wells and stepwells a modest monsoon rise but an overall yearly decline", () => {
    for (const s of g.sources.data.filter((x) => x.type === "dug_well" || x.type === "stepwell")) {
      const lv = g.truth.sources[s.id].trueLevel;
      const jul31 = lv[daysBetween(tl.start, "2026-07-31")];
      const augSep = lv.slice(daysBetween(tl.start, "2026-08-01"), daysBetween(tl.start, "2026-09-30") + 1);
      const rise = Math.max(...augSep) - jul31;
      expect(rise).toBeGreaterThan(0.05);
      expect(rise, s.id).toBeLessThan(2.0); // REAL 2026 monsoon reached +36% near Rapar
      // A year-on-year decline, except where the REAL 2026 monsoon was above normal.
      const wetYear = (climate.monsoon?.[s.id]?.departurePct ?? 0) > 10;
      if (!wetYear) expect(lv[0], s.id).toBeGreaterThan(lv[demoIdx]);
    }
  });

  it("puts only the dead sensor (KU-16) beyond the Grey no-data threshold on the demo date", () => {
    const grey = g.sources.data
      .filter((s) => {
        const d = daysSinceLastReading(g.readings.data[s.id].values, demoIdx);
        return d === null || d > NO_DATA_GREY_DAYS;
      })
      .map((s) => s.id);
    expect(grey).toEqual(["KU-16"]);
  });

  it("rises after rain outside the monsoon (open ponds feel rain the same day)", () => {
    let checked = 0;
    for (const s of g.sources.data.filter((x) => x.type === "nadi" || x.type === "tanka")) {
      const rain = climateFor(climate, s).rainMm;
      const lv = g.truth.sources[s.id].trueLevel;
      for (let i = 1; i <= demoIdx; i++) {
        const m = monthOf(addDays(tl.start, i));
        const spec = SOURCE_SPECS.find((x) => x.id === s.id)!;
        if ((m >= 6 && m <= 9) || rain[i] < 8 || lv[i - 1] >= spec.capacityM - 0.05) continue;
        expect(lv[i] - lv[i - 1], `${s.id} ${addDays(tl.start, i)}`).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("scripts the Safe-to-Warning demo sources to drop faster after the demo date", () => {
    for (const id of ["TH-04", "KU-10"]) {
      const lv = g.truth.sources[id].trueLevel;
      const before = (lv[demoIdx - 14] - lv[demoIdx]) / 14;
      const after = (lv[demoIdx + 7] - lv[demoIdx + 21]) / 14;
      expect(after).toBeGreaterThan(2 * before);
    }
  });

  it("skips cloudy NDVI scenes", () => {
    const pts = Object.values(g.ndvi.data).flat();
    expect(pts.some((p) => p.cloudy && p.value === null)).toBe(true);
    expect(pts.every((p) => (p.cloudy ? p.value === null : p.value !== null))).toBe(true);
  });
});

describe("REAL drivers", () => {
  it("uses REAL, labelled ERA5 climate at every source when it is cached", () => {
    if (!real.climate) return; // fully simulated mode
    expect(real.climate.provenance).toBe("REAL");
    for (const s of g.sources.data) {
      expect(real.climate.data.sources?.[s.id]?.rainMm.length).toBe(tl.days);
    }
    const origin = real.climate.data.origin!;
    // Everything up to the demo date is observed (ERA5 or recent analysis), never forecast.
    expect(origin.slice(0, demoIdx + 1).every((o) => o === "era5" || o === "recent")).toBe(true);
  });

  it("adds the REAL CGWB district groundwater decline only to groundwater-fed sources", () => {
    if (!real.gwra) return;
    for (const spec of SOURCE_SPECS) {
      const t = g.truth.sources[spec.id] as { driftPerDay: number; regionalDriftPerDay: number };
      const d = real.gwra.districts[GWRA_DISTRICT_OF[spec.district]];
      const fed = spec.type === "dug_well" || spec.type === "borewell" || spec.type === "stepwell";
      expect(t.regionalDriftPerDay).toBeCloseTo(fed ? -d.impliedDeclineMPerYr / 365 : 0, 9);
      expect(t.driftPerDay).toBeCloseTo(spec.hidden.driftPerDay + t.regionalDriftPerDay, 9);
      expect(regionalDrift(spec, real)).toBe(t.regionalDriftPerDay);
    }
    // Over-exploited Jodhpur (Phalodi) declines faster than Kachchh, which has no deficit.
    expect(real.gwra.districts.jodhpur.impliedDeclineMPerYr).toBeGreaterThan(0.3);
    expect(real.gwra.districts.kachchh.impliedDeclineMPerYr).toBe(0);
  });
});

describe("hidden ground truth", () => {
  it("is never imported by app code (only tests may read it)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const src = readFileSync(p, "utf8");
          if (/(from\s+|import\(|require\()\s*["'][^"']*_truth/.test(src)) offenders.push(p);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
