/**
 * Writes the SIMULATED datasets to data/simulated/*.json.
 * Usage: npm run generate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateAll, DEFAULT_SEED } from "../src/lib/sim/generator";

const outDir = path.join(process.cwd(), "data", "simulated");
mkdirSync(outDir, { recursive: true });

const g = generateAll(DEFAULT_SEED);

const write = (name: string, value: unknown, pretty = false) => {
  const file = path.join(outDir, name);
  writeFileSync(file, JSON.stringify(value, null, pretty ? 2 : undefined) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
};

write("manifest.json", g.manifest, true);
write("sources.json", g.sources, true);
write("readings.json", g.readings);
write("usage.json", g.usage);
write("climate.json", g.climate);
write("ndvi.json", g.ndvi);
write("observations.json", g.observations);
write("_truth.json", g.truth);

// Quick summary so the scenario can be eyeballed.
const tl = g.manifest.timeline;
const demoIdx = 364;
console.log(`\nTimeline ${tl.start} .. ${tl.end} (${tl.days} days), demo date ${tl.demoDate}`);
const idx = (d: string) => Math.round((Date.parse(d) - Date.parse(tl.start)) / 86_400_000);
const preMonsoon = idx("2026-06-25");
const postMonsoon = idx("2026-09-06");
console.log("id     type        lvl@-365  pre-mon post-mon lvl@demo  lvl@+14  lvl@+28  fail  gaps%");
for (const s of g.sources.data) {
  const t = g.truth.sources[s.id].trueLevel;
  const r = g.readings.data[s.id].values;
  const gaps = (100 * r.slice(0, demoIdx + 1).filter((v) => v === null).length) / (demoIdx + 1);
  console.log(
    [
      s.id.padEnd(6),
      s.type.padEnd(11),
      t[0].toFixed(2).padStart(8),
      t[preMonsoon].toFixed(2).padStart(7),
      t[postMonsoon].toFixed(2).padStart(8),
      t[demoIdx].toFixed(2).padStart(9),
      t[demoIdx + 14].toFixed(2).padStart(8),
      t[demoIdx + 28].toFixed(2).padStart(8),
      s.failureLevelM.toFixed(2).padStart(5),
      gaps.toFixed(1).padStart(6),
    ].join(" "),
  );
}
const rainTotals = Object.entries(g.climate.data.districts).map(
  ([d, c]) => `${d}: ${c.rainMm.slice(0, demoIdx + 1).reduce((a, b) => a + b, 0).toFixed(0)} mm`,
);
console.log(`\nRain over the last year: ${rainTotals.join(", ")}`);
