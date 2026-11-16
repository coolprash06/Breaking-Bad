import { getSource } from "@/lib/data/store";
import { compareScenario } from "@/lib/forecast/scenario";
import { escalations, planDispatch, type DispatchMessage } from "@/lib/alerts/dispatch";
import type { ScenarioLite } from "@/lib/alerts/warnings";
import { PUMP_CUT } from "@/config/personas";
import { buildSourcesPayload } from "./sourcesView";

/** Pumping-cut re-run, in the shape the warning templates take. */
export function pumpScenario(sourceId: string, asOf: string): ScenarioLite | null {
  const src = getSource(sourceId);
  if (!src || !src.usedBy.includes("pump")) return null;
  const r = compareScenario(src, asOf, { pump: PUMP_CUT });
  return { cutPct: Math.round(PUMP_CUT * 100), extraDays: r.extraDays, beyondHorizon: r.beyondHorizon };
}

/** New warnings for a batch date, given the dedupe keys already sent. Used by the page and /api/dispatch. */
export function buildDispatch(requestedAsOf: string | null | undefined, sent: string[]): { asOf: string; messages: DispatchMessage[] } {
  const { asOf, sources } = buildSourcesPayload(requestedAsOf);
  const scenarios: Record<string, ScenarioLite | null> = {};
  for (const s of escalations(sources, sent)) if (s.usedBy.includes("pump")) scenarios[s.id] = pumpScenario(s.id, asOf);
  return { asOf, messages: planDispatch({ asOf, sources, sent, scenarios }) };
}
