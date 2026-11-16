import { describe, expect, it } from "vitest";
import { buildDispatch } from "@/lib/api/dispatchView";
import { escalations } from "./dispatch";
import type { SourceLite } from "./warnings";
import { addDays } from "@/lib/time";
import { PERSONAS, receivesTier } from "@/config/personas";

const DEMO = "2026-11-16";

describe("dispatch from the engine", () => {
  const base = buildDispatch(DEMO, []);
  const sent = [...new Set(base.messages.map((m) => m.key))];

  it("sends demo-day warnings for sources already at risk, each to the personas that use them", () => {
    expect(base.messages.length).toBeGreaterThan(0);
    const nadi9 = base.messages.filter((m) => m.sourceId === "TH-09");
    expect(nadi9.map((m) => m.personaId)).toEqual(expect.arrayContaining(["household", "herder", "panchayat"]));
    expect(nadi9.every((m) => m.recipients.count > 0)).toBe(true);
    // Field users get Hindi by default, officers English.
    expect(nadi9.find((m) => m.personaId === "herder")!.lang).toBe("hi");
    expect(nadi9.find((m) => m.personaId === "panchayat")!.lang).toBe("en");
  }, 60_000);

  it("never repeats a source + tier, and sends new ones as the clock moves", () => {
    const later = buildDispatch(addDays(DEMO, 14), sent);
    for (const m of later.messages) expect(sent).not.toContain(m.key);
    const again = buildDispatch(addDays(DEMO, 14), [...sent, ...later.messages.map((m) => m.key)]);
    expect(again.messages).toHaveLength(0);
  }, 60_000);

  it("alert fatigue: Watch goes only to the Panchayat and officers; field users from Warning up, or to check a Grey source", () => {
    let all = [...base.messages];
    let keys = [...sent];
    for (const d of [7, 14, 21, 28, 35, 42]) {
      const r = buildDispatch(addDays(DEMO, d), keys);
      all = [...all, ...r.messages];
      keys = [...keys, ...r.messages.map((m) => m.key)];
    }
    const watch = all.filter((m) => m.tier === "watch");
    expect(watch.length).toBeGreaterThan(0);
    for (const m of watch) expect(`${m.sourceId} ${m.personaId} ${m.category}`).toMatch(/ manage$/);
    for (const m of all.filter((x) => x.category !== "manage")) expect(["warning", "emergency", "nodata"]).toContain(m.tier);
    // Grey sources still ask their field users to check and reply.
    const grey = all.filter((m) => m.tier === "nodata" && m.category !== "manage");
    for (const m of grey) expect(m.text.en).toContain("reply 1 = low, 2 = fine");
  }, 120_000);

  it("receivesTier encodes the rule per persona", () => {
    const herder = PERSONAS.find((p) => p.id === "herder")!;
    const panchayat = PERSONAS.find((p) => p.id === "panchayat")!;
    expect(receivesTier(herder, "watch")).toBe(false);
    expect(receivesTier(herder, "warning")).toBe(true);
    expect(receivesTier(herder, "nodata")).toBe(true);
    expect(receivesTier(panchayat, "watch")).toBe(true);
    expect(receivesTier(panchayat, "safe")).toBe(false);
  });

  it("only escalations send: stepping back down to a lower tier sends nothing", () => {
    const fake = (tier: SourceLite["status"]["tier"]) => [{ id: "X", status: { tier } } as unknown as SourceLite];
    expect(escalations(fake("watch"), ["X|warning"])).toHaveLength(0);
    expect(escalations(fake("emergency"), ["X|warning"])).toHaveLength(1);
    expect(escalations(fake("safe"), [])).toHaveLength(0);
    expect(escalations(fake("nodata"), ["X|warning"])).toHaveLength(1);
    expect(escalations(fake("nodata"), ["X|nodata"])).toHaveLength(0);
  });

  it("pumped sources tell farmers what a 30% cut gains, from the scenario re-run", () => {
    const all = [...base.messages, ...buildDispatch(addDays(DEMO, 28), sent).messages];
    const farm = all.filter((m) => m.personaId === "farmer" && m.tier !== "nodata");
    expect(farm.length).toBeGreaterThan(0);
    for (const m of farm) expect(m.text.en).toMatch(/Cut(ting)? pumping/);
  }, 60_000);
});
