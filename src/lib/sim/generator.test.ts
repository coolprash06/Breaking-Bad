import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { generateAll } from "./generator";
import { SOURCE_SPECS } from "./specs";
import { daysBetween, monthOf, addDays } from "@/lib/time";
import type { SourceType } from "@/lib/types";
import { daysSinceLastReading } from "@/lib/data/series";
import { NO_DATA_GREY_DAYS } from "@/config/thresholds";

const g = generateAll();
const tl = g.manifest.timeline;
const demoIdx = daysBetween(tl.start, tl.demoDate);
const ALL_TYPES: SourceType[] = ["dug_well", "borewell", "stepwell", "nadi", "tanka", "beri_virda", "oasis"];

describe("simulated data generator", () => {
  it("is deterministic and matches the committed data files", () => {
    const again = generateAll();
    expect(JSON.stringify(again.readings)).toBe(JSON.stringify(g.readings));
    const onDisk = JSON.parse(readFileSync(path.join("data", "simulated", "readings.json"), "utf8"));
    expect(onDisk).toEqual(g.readings);
  });

  it("covers 15-20 sources, both regions and every source type", () => {
    const s = g.sources.data;
    expect(s.length).toBeGreaterThanOrEqual(15);
    expect(s.length).toBeLessThanOrEqual(20);
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
    for (const s of g.sources.data.filter((x) => x.type === "nadi" || x.type === "oasis")) {
      const lv = g.truth.sources[s.id].trueLevel;
      const rain = g.climate.data.districts[s.district].rainMm;
      const meanDrop = (month: number) => {
        const d: number[] = [];
        for (let i = 1; i <= demoIdx; i++) {
          const date = addDays(tl.start, i);
          if (monthOf(date) === month && rain[i] === 0 && lv[i] > 0.05 && lv[i - 1] > 0.05) {
            d.push(lv[i - 1] - lv[i]);
          }
        }
        return d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
      };
      expect(meanDrop(5)).toBeGreaterThan(meanDrop(1));
    }
  });

  it("gives dug wells and stepwells a modest monsoon rise but an overall yearly decline", () => {
    for (const s of g.sources.data.filter((x) => x.type === "dug_well" || x.type === "stepwell")) {
      const lv = g.truth.sources[s.id].trueLevel;
      const jul31 = lv[daysBetween(tl.start, "2026-07-31")];
      const augSep = lv.slice(daysBetween(tl.start, "2026-08-01"), daysBetween(tl.start, "2026-09-30") + 1);
      const rise = Math.max(...augSep) - jul31;
      expect(rise).toBeGreaterThan(0.05);
      expect(rise).toBeLessThan(1.0);
      expect(lv[0]).toBeGreaterThan(lv[demoIdx]);
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

  it("rises slightly after rare winter rainfall", () => {
    const i = daysBetween(tl.start, "2026-01-22");
    const lv = g.truth.sources["TH-01"].trueLevel;
    expect(lv[i] - lv[i - 1]).toBeGreaterThan(0);
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
