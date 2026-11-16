import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/time";
import { getSource, getTimeline } from "@/lib/data/store";
import { applyPersistence, rawTier, type RawTier, type RiskTier } from "./tiers";
import { evaluateAll, evaluateSource } from "./engine";
import { theilSen } from "./signals";

const raw = (...t: RiskTier[]): RawTier[] => t.map((tier) => ({ tier, capped: false, hard: false }));
const demo = getTimeline().demoDate;

describe("tier rules", () => {
  it("caps at Watch when fewer than 2 signals agree", () => {
    const r = rawTier({ currentLevel: 2, failureLevel: 0.5, ttfP10: 20, ttfP50: 30, fastDrop: true, agreeing: 1 });
    expect(r).toEqual({ tier: "watch", capped: true, hard: false });
    const ok = rawTier({ currentLevel: 2, failureLevel: 0.5, ttfP10: 20, ttfP50: 30, fastDrop: true, agreeing: 2 });
    expect(ok.tier).toBe("warning");
  });

  it("treats a level already at failure as an immediate Emergency", () => {
    const r = rawTier({ currentLevel: 0.3, failureLevel: 0.3, ttfP10: null, ttfP50: null, fastDrop: false, agreeing: 0 });
    expect(r).toEqual({ tier: "emergency", capped: false, hard: true });
  });

  it("does not flag a fast drop on a source that cannot plausibly fail soon", () => {
    const r = rawTier({ currentLevel: 18, failureLevel: 1.5, ttfP10: null, ttfP50: null, fastDrop: true, agreeing: 3 });
    expect(r.tier).toBe("safe");
  });
});

describe("persistence and hysteresis", () => {
  it("ignores a single noisy day", () => {
    expect(applyPersistence(raw("safe", "safe", "safe", "warning", "safe", "safe")).tier).toBe("safe");
  });

  it("escalates only after the signal holds for 3 days, and reports the pending change", () => {
    const two = applyPersistence(raw("safe", "safe", "safe", "warning", "warning"));
    expect(two.tier).toBe("safe");
    expect(two.pending).toEqual({ to: "warning", daysHeld: 2 });
    expect(applyPersistence(raw("safe", "safe", "warning", "warning", "warning")).tier).toBe("warning");
  });

  it("steps down only after 3 lower days", () => {
    expect(applyPersistence(raw("warning", "warning", "warning", "watch", "watch")).tier).toBe("warning");
    expect(applyPersistence(raw("warning", "warning", "watch", "watch", "watch")).tier).toBe("watch");
  });

  it("escalates a hard emergency immediately", () => {
    const r: RawTier[] = [...raw("watch", "watch"), { tier: "emergency", capped: false, hard: true }];
    expect(applyPersistence(r).tier).toBe("emergency");
  });
});

describe("alert engine on the simulated data", { timeout: 120_000 }, () => {
  it("shows the scripted sources going from Safe to Warning as the demo clock advances", () => {
    expect(evaluateSource(getSource("TH-04")!, demo).tier).toBe("safe");
    expect(evaluateSource(getSource("TH-04")!, addDays(demo, 7)).tier).toBe("warning");
    expect(evaluateSource(getSource("KU-10")!, demo).tier).toBe("safe");
    expect(evaluateSource(getSource("KU-10")!, addDays(demo, 10)).tier).toBe("warning");
  });

  it("shows the dead sensor as Grey, with the widest uncertainty", () => {
    const all = evaluateAll(demo);
    const ku16 = all.find((s) => s.sourceId === "KU-16")!;
    expect(ku16.tier).toBe("nodata");
    expect(ku16.reasons.some((r) => r.kind === "data")).toBe(true);
    const greys = all.filter((s) => s.tier === "nodata").map((s) => s.sourceId);
    expect(greys).toEqual(["KU-16"]);
  });

  it("states confidence and reasons in every alert", () => {
    for (const s of evaluateAll(demo)) {
      expect(s.summary).toMatch(/\d+% confident/);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
      if (s.tier !== "safe") expect(s.reasons.length).toBeGreaterThan(0);
    }
  });

  it("explains the Well #4 warning with the pumping restart", () => {
    const s = evaluateSource(getSource("TH-04")!, addDays(demo, 7));
    expect(s.reasons.map((r) => r.text).join(" ")).toMatch(/pumping restarted/i);
    expect(s.signals.agreeing).toBeGreaterThanOrEqual(2);
  });
});

describe("robust slope", () => {
  it("ignores a single glitch", () => {
    const pts = [0, 1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 2 - 0.01 * x }));
    pts[3].y += 0.4;
    expect(theilSen(pts)).toBeCloseTo(-0.01, 3);
  });
});
