import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getSnapshot } from "@/lib/data/store";
import { evaluateSource } from "@/lib/alerts/engine";
import { getSource, getSources } from "@/lib/data/store";
import type { WaterBodiesData } from "./types";
import { flagHaze } from "./haze";

const water = JSON.parse(readFileSync("data/real/water-bodies.json", "utf8")) as WaterBodiesData;

describe("REAL Sentinel-2 NDVI", () => {
  const snap = getSnapshot();

  it("replaces the simulated NDVI and is labelled REAL", () => {
    expect(snap.ndvi.provenance).toBe("REAL");
    for (const s of getSources().data) expect(snap.ndvi.data[s.id]?.length, s.id).toBeGreaterThan(40);
  });

  it("skips cloudy scenes: a cloudy scene never carries a value", () => {
    const all = Object.values(snap.ndvi.data).flat();
    expect(all.some((p) => p.cloudy)).toBe(true);
    for (const p of all) {
      if (p.cloudy) expect(p.value).toBeNull();
      else expect(p.value).not.toBeNull();
    }
  });

  it("never shows an image from after the clock date", () => {
    for (const pts of Object.values(snap.ndvi.data)) for (const p of pts) expect(p.date <= snap.asOf).toBe(true);
  });

  it("uses the last clear image when the newest one is cloudy (F7)", () => {
    const st = evaluateSource(getSource("TH-09")!);
    const pts = snap.ndvi.data["TH-09"];
    const lastClear = [...pts].reverse().find((p) => !p.cloudy)!;
    expect(st.signals.ndvi.latestDate).toBe(lastClear.date);
    expect(st.signals.ndvi.skippedCloudy).toBe(pts.length - 1 - pts.lastIndexOf(lastClear));
  });
});

describe("Satellite-checked water bodies", () => {
  it("has 2-3 real, named lakes with a year of clear readings", () => {
    expect(water.bodies.length).toBeGreaterThanOrEqual(2);
    expect(water.bodies.length).toBeLessThanOrEqual(3);
    for (const b of water.bodies) {
      expect(b.coordinateSource).toMatch(/^https:\/\//);
      const clear = b.series.filter((p) => p.areaHa !== null);
      expect(clear.length, b.name).toBeGreaterThan(30);
      expect(Math.max(...clear.map((p) => p.areaHa as number)), b.name).toBeGreaterThan(1);
      for (const p of b.series) if (p.cloudy) expect(p.areaHa).toBeNull();
    }
  });
});

describe("haze filter", () => {
  it("flags a clear reading far below its neighbours and keeps the raw value", () => {
    const s = [10, 10.2, 9.9, 0.3, 10.1, 9.8, 10].map((v, i) => ({ date: `2026-01-0${i + 1}`, areaHa: v, cloudy: false }));
    const out = flagHaze(s);
    expect(out[3]).toEqual({ date: "2026-01-04", areaHa: null, cloudy: false, haze: 0.3 });
    expect(out.filter((p) => p.haze !== undefined)).toHaveLength(1);
  });

  it("leaves a genuine steady decline alone", () => {
    const s = [10, 9, 8, 7, 6, 5, 4].map((v, i) => ({ date: `2026-01-0${i + 1}`, areaHa: v, cloudy: false }));
    expect(flagHaze(s).every((p) => p.haze === undefined)).toBe(true);
  });
});
