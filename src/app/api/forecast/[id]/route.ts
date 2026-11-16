import type { NextRequest } from "next/server";
import { clampAsOf, getSnapshot, getSource } from "@/lib/data/store";
import { evaluateSource } from "@/lib/alerts/engine";
import { forecastSource } from "@/lib/forecast/engine";
import { describeLearned } from "@/lib/forecast/describe";
import { isGroundwaterLagged } from "@/lib/forecast/features";
import { compareScenario } from "@/lib/forecast/scenario";
import { parseUsageCut } from "@/lib/api/params";
import { addDays } from "@/lib/time";
import { climateFor } from "@/lib/types";

const HISTORY_DAYS = 120;

/** Full detail for one source: history, forecast band, learned parameters, reasons, scenario. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/forecast/[id]">) {
  const { id } = await ctx.params;
  const source = getSource(id);
  if (!source) return Response.json({ error: `Unknown source ${id}` }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const asOf = clampAsOf(sp.get("asOf"));
  const snap = getSnapshot(asOf);
  const status = evaluateSource(source, asOf);
  const fc = forecastSource(source, asOf);
  const cut = parseUsageCut(sp);
  const scenario = Object.keys(cut).length ? compareScenario(source, asOf, cut) : null;

  const n = snap.length;
  const glitches = new Set(fc.model.glitchIdx);
  const from = Math.max(0, n - HISTORY_DAYS);
  const rain = climateFor(snap.climate.data, source).rainMm;
  const values = snap.readings.data[source.id].values;
  const history = [];
  for (let i = from; i < n; i++) {
    history.push({ date: addDays(snap.timeline.start, i), level: values[i], rain: rain[i], glitch: glitches.has(i) });
  }
  const forecast = fc.ensemble.band.map((b) => ({
    date: addDays(asOf, b.day),
    p10: round(b.p10),
    p50: round(b.p50),
    p90: round(b.p90),
  }));

  const m = fc.model;
  return Response.json({
    asOf,
    source,
    status,
    provenance: {
      readings: snap.readings.provenance,
      usage: snap.usage.provenance,
      climate: snap.climate.provenance,
      ndvi: snap.ndvi.provenance,
      observations: snap.observations.provenance,
    },
    history,
    observations: snap.observations.data[source.id] ?? [],
    forecast,
    learned: {
      method: "Weighted ridge regression with physical sign constraints, on intervals between valid readings",
      params: describeLearned(source, m, isGroundwaterLagged(source)),
      r2: m.r2,
      nIntervals: m.nIntervals,
      nDaysCovered: m.nDaysCovered,
      nOutliers: m.nOutliers,
      sensorNoiseCm: m.sensorSd * 100,
      dailyVariationCm: m.processSd * 100,
      fitFrom: m.fitFrom,
      fitTo: m.fitTo,
    },
    widening: fc.ensemble.widening,
    usage: status.signals.usageChanges,
    scenario,
  });
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
