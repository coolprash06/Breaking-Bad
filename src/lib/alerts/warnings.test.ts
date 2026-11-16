import { describe, expect, it } from "vitest";
import { getSources } from "@/lib/data/store";
import { evaluateSource } from "./engine";
import { haversineKm, isSuitable, nearestSafe, type Candidate } from "./nearest";
import { personaWarning, type SourceLite } from "./warnings";
import { PERSONAS } from "@/config/personas";
import type { DisplayTier } from "./tiers";
import { addDays } from "@/lib/time";
import { smsInfo } from "@/lib/sms/segments";

const sources = getSources().data;
const byId = (id: string) => sources.find((s) => s.id === id)!;
const DEMO = "2026-11-16";

/** Same shape the API sends (the short SMS reason is picked from the engine's reasons). */
function liteAll(date: string): SourceLite[] {
  return sources.map((s) => {
    const st = evaluateSource(s, date);
    return { ...s, status: { ...st, reasonSms: st.reasons.find((r) => r.sms)?.sms ?? null } };
  });
}

describe("haversineKm", () => {
  it("matches known distances", () => {
    // Bikaner to Phalodi is roughly 110-130 km in a straight line.
    const d = haversineKm({ lat: 28.02, lon: 73.31 }, { lat: 27.13, lon: 72.36 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(140);
    expect(haversineKm({ lat: 25, lon: 71 }, { lat: 25, lon: 71 })).toBe(0);
  });
});

describe("Hindi wording", () => {
  it("says the WATER is falling (पानी, masculine), never that the source itself shrinks", () => {
    const all = liteAll(DEMO);
    for (const src of all) {
      const forced = { ...src, status: { ...src.status, tier: "watch" as const } };
      for (const p of PERSONAS) {
        const hi = personaWarning(p, forced, all, DEMO).hi;
        expect(hi, `${src.id} ${p.id}`).not.toMatch(/नं\.\d+ तेजी से घट/);
        expect(hi, `${src.id} ${p.id}`).not.toMatch(/पानी[^।,]*घट रही/);
      }
    }
    const tw6 = all.find((s) => s.id === "TH-06")!;
    const w = personaWarning(PERSONAS.find((p) => p.id === "household")!, { ...tw6, status: { ...tw6.status, tier: "watch" } }, all, DEMO);
    expect(w.hi).toContain("बावड़ी नं.6 का पानी तेजी से घट रहा");
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
  const all = liteAll(DEMO);
  const nadi9 = all.find((s) => s.id === "TH-09")!;

  it("sends Nadi #9 herders to a nearby animal-capable Safe source, with confidence stated", () => {
    const herder = PERSONAS.find((p) => p.id === "herder")!;
    const w = personaWarning(herder, nadi9, all, DEMO);
    expect(w.isAlert).toBe(true);
    expect(w.text).toMatch(/\d+% sure/);
    expect(w.hi).toMatch(/\d+% पक्का/);
    expect(w.hi).toContain("कुआँ नं.22");
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
      expect(w.text).toMatch(/Get drinking water from|Fill tankers at|Move bathing and washing to|drink and refill at|No safe|Move herds to/);
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

describe("SMS length and wording of every template", () => {
  const tiers = ["watch", "warning", "emergency", "nodata", "safe"] as const;

  it("fits every persona x source x tier in 1-2 segments; English stays GSM-7; confidence always stated", () => {
    let checked = 0;
    for (const date of [DEMO, addDays(DEMO, 21)]) {
      const all = liteAll(date);
      for (const src of all)
        for (const tier of tiers)
          for (const p of PERSONAS) {
            const forced = { ...src, status: { ...src.status, tier } };
            const scenario = { cutPct: 30, extraDays: 23, beyondHorizon: false };
            const w = personaWarning(p, forced, all, date, { scenario });
            const en = smsInfo(w.text);
            const hi = smsInfo(w.hi);
            const where = `${src.id} ${tier} ${p.id}`;
            expect(en.encoding, where).toBe("GSM-7");
            expect(en.segments, `${where}: ${w.text}`).toBeLessThanOrEqual(2);
            expect(hi.segments, `${where}: ${w.hi}`).toBeLessThanOrEqual(2);
            expect(w.text, where).toMatch(/\d+%/);
            expect(w.hi, where).toMatch(/\d+%/);
            checked++;
          }
    }
    expect(checked).toBeGreaterThan(2000);
  }, 60_000);

  it("farmers get the pumping-cut result from the scenario re-run, not a fixed number", () => {
    const farmer = PERSONAS.find((p) => p.id === "farmer")!;
    const all = liteAll(DEMO);
    const tw5 = { ...all.find((s) => s.id === "TH-05")!, status: { ...all.find((s) => s.id === "TH-05")!.status, tier: "warning" as const } };
    const a = personaWarning(farmer, tw5, all, DEMO, { scenario: { cutPct: 30, extraDays: 23, beyondHorizon: false } });
    const b = personaWarning(farmer, tw5, all, DEMO, { scenario: { cutPct: 30, extraDays: 44, beyondHorizon: false } });
    expect(a.text).toContain("about 3 more weeks");
    expect(b.text).toContain("about 6 more weeks");
    expect(a.hi).toContain("करीब 3 हफ्ते");
  });

  it("Stepwell #6 tells every field persona to contact the Panchayat, in both languages", () => {
    const all = liteAll(DEMO);
    const ts6 = all.find((s) => s.id === "TH-06")!;
    for (const p of PERSONAS.filter((x) => x.need !== "none" && ts6.usedBy.includes(x.category as never))) {
      const w = personaWarning(p, { ...ts6, status: { ...ts6.status, tier: "warning" } }, all, DEMO);
      expect(w.text).toContain("Contact the Panchayat.");
      expect(w.hi).toContain("पंचायत से बात करें।");
    }
  });
});
