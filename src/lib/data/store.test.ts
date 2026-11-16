import { describe, expect, it } from "vitest";
import { addDays, toUtcMs } from "@/lib/time";
import { getProvenance, getSnapshot, getTimeline } from "./store";
import { assertLabelled } from "./datasets";
import type { Dataset } from "@/lib/types";

const tl = getTimeline();

describe("data store", () => {
  it("defaults to the demo date and never exposes future readings", () => {
    const snap = getSnapshot();
    expect(snap.asOf).toBe(tl.demoDate);
    expect(snap.readings.data["TH-04"].values.length).toBe(snap.length);
    expect(snap.length).toBe(365);
    for (const pts of Object.values(snap.ndvi.data)) {
      for (const p of pts) expect(toUtcMs(p.date)).toBeLessThanOrEqual(toUtcMs(snap.asOf));
    }
  });

  it("reveals more days when the demo clock moves forward, and clamps to the timeline", () => {
    expect(getSnapshot(addDays(tl.demoDate, 7)).length).toBe(372);
    expect(getSnapshot("2099-01-01").asOf).toBe(tl.end);
    expect(getSnapshot("2020-01-01").asOf).toBe(tl.demoDate);
    expect(getSnapshot("not-a-date").asOf).toBe(tl.demoDate);
  });

  it("labels every dataset REAL or SIMULATED", () => {
    const entries = getProvenance();
    expect(entries).toHaveLength(6);
    for (const e of entries) expect(["REAL", "SIMULATED"]).toContain(e.provenance);
  });

  it("rejects unlabelled datasets", () => {
    const bad = { id: "climate", title: "x", source: "x", note: "x", data: {} } as unknown as Dataset<unknown>;
    expect(() => assertLabelled(bad, "climate")).toThrow(/provenance/);
  });
});
