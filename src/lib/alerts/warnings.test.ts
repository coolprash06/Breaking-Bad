import { describe, expect, it } from "vitest";
import { getSources } from "@/lib/data/store";
import { evaluateSource } from "./engine";
import { haversineKm, isSuitable, nearestSafe, type Candidate } from "./nearest";
import { personaWarning, type SourceLite } from "./warnings";
import { PERSONAS } from "@/config/personas";
import type { DisplayTier } from "./tiers";
import { addDays } from "@/lib/time";

const sources = getSources().data;
const byId = (id: string) => sources.find((s) => s.id === id)!;
const DEMO = "2026-11-16";

describe("haversineKm", () => {
  it("matches known distances", () => {
    // Bikaner to Phalodi is roughly 110-130 km in a straight line.
    const d = haversineKm({ lat: 28.02, lon: 73.31 }, { lat: 27.13, lon: 72.36 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(140);
    expect(haversineKm({ lat: 25, lon: 71 }, { lat: 25, lon: 71 })).toBe(0);
  });
});

describe("nearestSafe", () => {
  const allSafe: Candidate[] = sources.map((s) => ({ source: s, tier: "safe" as DisplayTier }));

  it("never suggests a non-animal-capable source to herders", () => {
    for (const from of sources) {
      const r = nearestSafe(from, allSafe, "animals", 1e6);
      if (r.closest) expect(r.closest.source.animalCapable).toBe(true);
    }
  });

  it("only suggests drinkable public sources for drinking", () => {
    for (const from of sources) {
      const r = nearestSafe(from, allSafe, "drink", 1e6);
      if (r.closest) {
        expect(isSuitable(r.closest.source, "drink")).toBe(true);
        expect(["nadi", "oasis"]).not.toContain(r.closest.source.type);
        expect(r.closest.source.usedBy).toContain("fetch");
      }
    }
  });

  it("finds Well #7 about 2 km from Well #4 (PRD example)", () => {
    const r = nearestSafe(byId("TH-04"), allSafe, "drink", 8);
    expect(r.within?.source.id).toBe("TH-07");
    expect(r.within!.km).toBeLessThan(4);
  });

  it("only suggests Safe sources (not Grey, not at risk)", () => {
    const mixed: Candidate[] = sources.map((s) => ({ source: s, tier: s.id === "TH-07" ? "nodata" : "safe" }));
    const r = nearestSafe(byId("TH-04"), mixed, "drink", 8);
    expect(r.within?.source.id).not.toBe("TH-07");
  });

  it("returns nothing within range when the only options are far away", () => {
    const r = nearestSafe(byId("TH-06"), allSafe, "animals", 25);
    expect(r.within).toBeNull();
    expect(r.closest!.km).toBeGreaterThan(25);
  });
});

describe("personaWarning on demo data", () => {
  const all: SourceLite[] = sources.map((s) => ({ ...s, status: evaluateSource(s, DEMO) }));
  const nadi9 = all.find((s) => s.id === "TH-09")!;

  it("sends Nadi #9 herders to a nearby animal-capable Safe source, with confidence stated", () => {
    const herder = PERSONAS.find((p) => p.id === "herder")!;
    const w = personaWarning(herder, nadi9, all, DEMO);
    expect(w.isAlert).toBe(true);
    expect(w.text).toMatch(/\d+% confident/);
    expect(w.text).toMatch(/Move herds to Well #22 \(\d+ km\)/);
    expect(w.nearest.within!.source.animalCapable).toBe(true);
  });

  it("says honestly when nothing suitable is near (Stepwell #6, the one isolated source)", () => {
    const ts6 = all.find((s) => s.id === "TH-06")!;
    const herder = PERSONAS.find((p) => p.id === "herder")!;
    const w = personaWarning(herder, { ...ts6, status: { ...ts6.status, tier: "warning" } }, all, DEMO);
    expect(w.text).toMatch(/No safe water for animals found within 25 km\. The closest is .+, \d+ km away\. Contact the Panchayat\./);
  });

  it("every field persona gets a nearest-safe line on an alert", () => {
    for (const p of PERSONAS.filter((x) => x.need !== "none")) {
      const w = personaWarning(p, nadi9, all, DEMO);
      expect(w.text).toMatch(/Nearest safe|No safe|Move herds to/);
    }
  });
});

describe("safe-alternative coverage through the demo weeks", () => {
  const dates = [0, 7, 14, 21, 28].map((d) => addDays(DEMO, d));
  const fieldPersonas = PERSONAS.filter((p) => p.need !== "none");

  // A warning (anything but Safe) must name a suitable Safe alternative. Safe sources send no warning.
  it("every alerting source except Stepwell #6 names a suitable Safe alternative for each persona that uses it", () => {
    const gaps: string[] = [];
    const alerting = new Set<string>();
    for (const date of dates) {
      const cands: Candidate[] = sources.map((s) => ({ source: s, tier: evaluateSource(s, date).tier }));
      for (const c of cands) {
        if (c.tier === "safe") continue;
        alerting.add(c.source.id);
        for (const p of fieldPersonas.filter((x) => c.source.usedBy.includes(x.category as never))) {
          if (!nearestSafe(c.source, cands, p.need, p.maxKm).within) gaps.push(`${date} ${c.source.id} ${p.id}`);
        }
      }
    }
    // The demo-scenario sources all alert at some point in these weeks.
    for (const id of ["TH-09", "KU-10", "TH-04", "KU-15", "TH-05", "TH-06"]) expect(alerting).toContain(id);
    const isolated = [...new Set(gaps.map((g) => g.split(" ")[1]))];
    expect(isolated).toEqual(["TH-06"]);
  }, 60_000);

  it("the added alternatives stay Safe through the demo weeks", () => {
    for (const date of dates)
      for (const s of sources.filter((x) => /-(19|2\d)$/.test(x.id)))
        expect(`${s.id} ${evaluateSource(s, date).tier}`).toBe(`${s.id} safe`);
  }, 60_000);

  it("Stepwell #6 is the only source with no suitable alternative for any of its personas", () => {
    const cands: Candidate[] = sources.map((s) => ({ source: s, tier: "safe" as DisplayTier }));
    const ts6 = byId("TH-06");
    for (const p of fieldPersonas.filter((x) => ts6.usedBy.includes(x.category as never))) {
      expect(nearestSafe(ts6, cands, p.need, p.maxKm).within).toBeNull();
    }
  });

  it("Borewell #5's village has safe drinking water within 8 km (Panchayat message)", () => {
    const cands: Candidate[] = sources.map((s) => ({ source: s, tier: evaluateSource(s, addDays(DEMO, 14)).tier }));
    expect(nearestSafe(byId("TH-05"), cands, "drink", 8).within).not.toBeNull();
  });
});
