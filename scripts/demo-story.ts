/**
 * Dev check: prints each source's tier on demo day and as the batch clock moves,
 * so the scripted demo story can be verified after data changes.
 * Usage: npx tsx scripts/demo-story.ts
 */
import { getSources, getTimeline } from "../src/lib/data/store";
import { evaluateAll } from "../src/lib/alerts/engine";
import { addDays } from "../src/lib/time";

const tl = getTimeline();
const offsets = [0, 3, 7, 14, 21, 28];
const byDay = offsets.map((d) => {
  const asOf = addDays(tl.demoDate, d);
  return new Map(evaluateAll(asOf).map((s) => [s.sourceId, s]));
});
const short: Record<string, string> = { safe: "Safe", watch: "Watch", warning: "WARN", emergency: "EMERG", nodata: "grey" };
console.log("id     name            " + offsets.map((d) => `+${d}d`.padEnd(8)).join("") + " demo-day estimate | reasons");
for (const s of getSources().data) {
  const cells = byDay.map((m) => short[m.get(s.id)!.tier].padEnd(8)).join("");
  const st = byDay[0].get(s.id)!;
  console.log(`${s.id.padEnd(6)} ${s.name.padEnd(15)} ${cells} ${st.label} | ${st.reasons.filter((r) => r.kind !== "data").map((r) => r.text).join("; ")}`);
}
