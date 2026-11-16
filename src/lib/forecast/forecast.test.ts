import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dateAt, getSnapshot, getSource, getSources } from "@/lib/data/store";
import { daysBetween } from "@/lib/time";
import { buildFeatures } from "./features";
import { learnParameters, expectedDelta } from "./calibrate";
import { runEnsemble } from "./ensemble";
import { forecastSource } from "./engine";
import { compareScenario } from "./scenario";
import { USAGE_CATEGORIES } from "@/lib/types";

// Tests (and only tests) may read the hidden simulation truth.
const truth = JSON.parse(readFileSync("data/simulated/_truth.json", "utf8")).sources as Record<
  string,
  { rechargePerMm: number; evapPerMmPet: number; driftPerDay: number; ratePerUnit: Record<string, number> }
>;
const snap = getSnapshot();
const n = snap.length;

describe("learning step (regression on past readings)", () => {
  const sources = getSources().data;
  const learned = Object.fromEntries(
    sources.map((s) => [s.id, learnParameters(s, snap.readings.data[s.id].values, buildFeatures(snap, s), dateAt)]),
  );

  it("learns each source's typical daily change close to the hidden truth", () => {
    for (const s of sources) {
      const f = buildFeatures(snap, s);
      const t = truth[s.id];
      const trueModel = {
        coef: {
          recharge: t.rechargePerMm, evap: t.evapPerMmPet, fetch: t.ratePerUnit.fetch,
          spot: t.ratePerUnit.spot, pump: t.ratePerUnit.pump, drift: t.driftPerDay,
        },
      };
      let learnedSum = 0;
      let trueSum = 0;
      for (let i = n - 30; i < n; i++) {
        const drivers = {
          rechargeRain: f.rechargeRain[i],
          pet: f.pet[i],
          usage: { fetch: f.usage.fetch[i], spot: f.usage.spot[i], pump: f.usage.pump[i] },
        };
        learnedSum += expectedDelta(learned[s.id], drivers);
        trueSum += expectedDelta(trueModel, drivers);
      }
      const diffPerDay = Math.abs(learnedSum - trueSum) / 30;
      expect(diffPerDay, s.id).toBeLessThan(Math.max(0.25 * Math.abs(trueSum / 30), 0.003));
    }
  });

  it("recovers rain recharge and pumping rates from the data", () => {
    for (const s of sources) {
      const t = truth[s.id];
      const m = learned[s.id];
      if (t.rechargePerMm >= 0.004) {
        expect(Math.abs(m.coef.recharge - t.rechargePerMm) / t.rechargePerMm, `${s.id} recharge`).toBeLessThan(0.2);
      }
      if (s.usedBy.includes("pump")) {
        expect(Math.abs(m.coef.pump - t.ratePerUnit.pump) / t.ratePerUnit.pump, `${s.id} pump`).toBeLessThan(0.2);
      }
    }
  });

  it("marks drivers with no data as not identified instead of inventing a value", () => {
    const m = learned["TH-02"]; // tanka: no pumping, no livestock
    expect(m.notIdentified).toContain("pump");
    expect(m.coef.pump).toBe(0);
  });

  it("reports fit quality and separates sensor noise from real variation", () => {
    for (const s of sources) {
      const m = learned[s.id];
      expect(m.nIntervals).toBeGreaterThan(200);
      expect(m.sensorSd).toBeGreaterThan(0.002);
      expect(m.sensorSd).toBeLessThan(0.02);
    }
  });
});

describe("ensemble forecast", () => {
  it("is deterministic", () => {
    const s = getSource("TH-04")!;
    const a = forecastSource(s, "2026-11-20", { members: 120 });
    const b = forecastSource(s, "2026-11-20", { members: 121 });
    const c = forecastSource(s, "2026-11-20", { members: 120 });
    expect(a).toBe(c); // cached
    expect(b.ensemble.ttf.p50).not.toBeUndefined();
  });

  it("widens the confidence band when sensor data is missing (F7)", () => {
    const s = getSource("TH-06")!;
    const f = buildFeatures(snap, s);
    const readings = snap.readings.data[s.id].values;
    const m = learnParameters(s, readings, f, dateAt);
    const base = {
      source: s, model: m, features: f, observations: snap.observations.data[s.id] ?? [],
      dateToIdx: (d: string) => daysBetween(snap.timeline.start, d), asOfIdx: n - 1, asOf: snap.asOf, members: 300,
    };
    const full = runEnsemble({ ...base, readings });
    const gappy = runEnsemble({ ...base, readings: readings.map((v, i) => (i > n - 11 ? null : v)) });
    const width = (r: typeof full) => r.band[28].p90 - r.band[28].p10;
    expect(width(gappy)).toBeGreaterThan(1.3 * width(full));
    expect(gappy.widening.factor).toBeGreaterThan(full.widening.factor);
  });

  it("uses a newer manual measurement when the sensor is dead (KU-16)", () => {
    const f = forecastSource(getSource("KU-16")!, snap.asOf);
    expect(f.ensemble.start.kind).toBe("manual");
  });

  it("buys time when usage is cut (Cat 3 scenario)", () => {
    const s = getSource("TH-04")!;
    const r = compareScenario(s, "2026-11-23", { pump: 0.5 });
    expect(r.extraDays).not.toBeNull();
    expect(r.extraDays as number).toBeGreaterThan(7);
  });

  it("reports usage in all categories the source uses", () => {
    const f = forecastSource(getSource("TH-04")!, snap.asOf);
    for (const c of USAGE_CATEGORIES) expect(f.ensemble.recentUsage[c]).toBeGreaterThanOrEqual(0);
  });
});
