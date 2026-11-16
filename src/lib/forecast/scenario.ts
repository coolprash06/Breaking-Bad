/**
 * "What if" re-runs of the same engine with usage cut (F5 Cat 3:
 * "Reduce pumping 30% to keep the village well alive 6 more weeks").
 */
import type { UsageCategory, WaterSource } from "@/lib/types";
import { forecastSource } from "./engine";
import { HORIZON_DAYS, type UsageCut } from "./ensemble";

export interface ScenarioResult {
  usageCut: UsageCut;
  baselineP50: number | null;
  scenarioP50: number | null;
  /** Extra days before failure (median). null if neither fails within the horizon. */
  extraDays: number | null;
  /** True if the cut pushes the median failure beyond the forecast horizon. */
  beyondHorizon: boolean;
  label: string;
}

const CAT_LABEL: Record<UsageCategory, string> = {
  fetch: "household drawing",
  spot: "on-spot use",
  pump: "pumping",
};

export function compareScenario(source: WaterSource, asOf: string | null | undefined, cut: UsageCut): ScenarioResult {
  const base = forecastSource(source, asOf);
  const alt = forecastSource(source, asOf, { usageCut: cut });
  const b = base.ensemble.ttf.p50;
  const a = alt.ensemble.ttf.p50;
  const what = (Object.entries(cut) as [UsageCategory, number][])
    .filter(([, v]) => v > 0)
    .map(([c, v]) => `${CAT_LABEL[c]} by ${Math.round(v * 100)}%`)
    .join(" and ");

  if (b === null) {
    return { usageCut: cut, baselineP50: b, scenarioP50: a, extraDays: null, beyondHorizon: true, label: `Already safe for ${Math.floor(HORIZON_DAYS / 7)}+ weeks` };
  }
  if (a === null) {
    const extra = HORIZON_DAYS - b;
    return {
      usageCut: cut, baselineP50: b, scenarioP50: null, extraDays: extra, beyondHorizon: true,
      label: `Cutting ${what} keeps it alive more than ${Math.floor(extra / 7)} more weeks`,
    };
  }
  const extra = a - b;
  const weeks = Math.round(extra / 7);
  return {
    usageCut: cut, baselineP50: b, scenarioP50: a, extraDays: extra, beyondHorizon: false,
    label:
      weeks >= 1
        ? `Cutting ${what} keeps it alive about ${weeks} more week${weeks === 1 ? "" : "s"}`
        : `Cutting ${what} adds about ${Math.max(0, extra)} days`,
  };
}
