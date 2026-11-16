/**
 * Dev check: compare LEARNED parameters with the hidden simulation truth.
 * Usage: npx tsx scripts/check-learning.ts
 */
import { readFileSync } from "node:fs";
import { getSnapshot, dateAt } from "../src/lib/data/store";
import { buildFeatures } from "../src/lib/forecast/features";
import { learnParameters, PARAM_KEYS } from "../src/lib/forecast/calibrate";

const truth = JSON.parse(readFileSync("data/simulated/_truth.json", "utf8")).sources;
const snap = getSnapshot();
const fmt = (x: number) => (x * 1000).toFixed(2).padStart(7); // mm/day units

console.log("values x1000 (mm per unit-day); learned / true");
for (const s of snap.sources.data) {
  const f = buildFeatures(snap, s);
  const m = learnParameters(s, snap.readings.data[s.id].values, f, dateAt);
  const t = truth[s.id];
  const tv: Record<string, number> = {
    recharge: t.rechargePerMm, evap: t.evapPerMmPet, fetch: t.ratePerUnit.fetch,
    spot: t.ratePerUnit.spot, pump: t.ratePerUnit.pump, drift: t.driftPerDay,
  };
  const used = new Set<string>(s.usedBy);
  const cols = PARAM_KEYS.map((k) => {
    const relevant = !["fetch", "spot", "pump"].includes(k) || used.has(k);
    return `${k}:${fmt(m.coef[k])}/${relevant ? fmt(tv[k]) : "    n/a"}`;
  });
  console.log(
    `${s.id} R2=${m.r2.toFixed(2)} n=${m.nIntervals} out=${m.nOutliers} sens=${(m.sensorSd * 1000).toFixed(1)}/${(t.sensorSd * 1000).toFixed(1)} proc=${(m.processSd * 1000).toFixed(1)}/${(t.processSd * 1000).toFixed(1)} | ${cols.join(" ")}`,
  );
}
