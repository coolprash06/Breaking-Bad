import { describe, expect, it } from "vitest";
import { getSources } from "@/lib/data/store";
import { evaluateSource } from "./engine";
import { haversineKm, isSuitable, nearestSafe, type Candidate } from "./nearest";
import { personaWarning, type SourceLite } from "./warnings";
import { PERSONAS } from "@/config/personas";
import type { DisplayTier } from "./tiers";

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
    const r = nearestSafe(byId("TH-09"), allSafe, "animals", 25);
    expect(r.within).toBeNull();
    expect(r.closest!.km).toBeGreaterThan(25);
  });
});

describe("personaWarning on demo data", () => {
  const all: SourceLite[] = sources.map((s) => ({ ...s, status: evaluateSource(s, DEMO) }));
  const nadi9 = all.find((s) => s.id === "TH-09")!;

  it("states confidence and honestly says when nothing safe is near", () => {
    const herder = PERSONAS.find((p) => p.id === "herder")!;
    const w = personaWarning(herder, nadi9, all, DEMO);
    expect(w.isAlert).toBe(true);
    expect(w.text).toMatch(/\d+% confident/);
    expect(w.text).toMatch(/No safe water for animals found within 25 km/);
    expect(w.text).not.toMatch(/Stepwell #6/);
  });

  it("every field persona gets a nearest-safe line on an alert", () => {
    for (const p of PERSONAS.filter((x) => x.need !== "none")) {
      const w = personaWarning(p, nadi9, all, DEMO);
      expect(w.text).toMatch(/Nearest safe|No safe|Move herds to/);
    }
  });
});
