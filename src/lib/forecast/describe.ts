/** Human-readable views of the learned model ("Learned from data" panel). */
import type { WaterSource } from "@/lib/types";
import type { LearnedModel, ParamKey } from "./calibrate";

export interface LearnedParamView {
  key: ParamKey;
  label: string;
  /** Value converted to display units. */
  value: number;
  se: number;
  unit: string;
  /** Short plain-language meaning, e.g. "Each 100 households lower the level 0.9 cm/day". */
  meaning: string;
  identified: boolean;
  relevant: boolean;
}

const SPEC: Record<ParamKey, { label: string; factor: number; unit: string }> = {
  recharge: { label: "Rain recharge", factor: 1000, unit: "mm per mm of rain" },
  evap: { label: "Evaporation loss", factor: 1000, unit: "mm per mm of PET" },
  fetch: { label: "Household / tanker drawing", factor: 1e4, unit: "cm/day per 100 households" },
  spot: { label: "Livestock & on-spot use", factor: 1e4, unit: "cm/day per 100 animals" },
  pump: { label: "Farm pumping", factor: 100, unit: "cm per pump-hour" },
  drift: { label: "Background trend", factor: 100, unit: "cm/day" },
};

function meaningOf(key: ParamKey, v: number, lagged: boolean): string {
  const f = (x: number, dp = 1) => x.toFixed(dp);
  switch (key) {
    case "recharge":
      return `10 mm of rain raises the level ${f((v * 10) / 10, 1)} cm${lagged ? " (over ~2 weeks, through the ground)" : ""}`;
    case "evap":
      return v < 0.05 ? "Almost no evaporation (covered or deep)" : `A hot day (8 mm PET) costs ${f((v * 8) / 10, 1)} cm`;
    case "fetch":
      return `Each 100 households lower it ${f(v, 2)} cm/day`;
    case "spot":
      return `Each 100 animals lower it ${f(v, 2)} cm/day`;
    case "pump":
      return `Each pump-hour lowers it ${f(v, 1)} cm`;
    case "drift":
      return v >= 0 ? `Refills ${f(v, 2)} cm/day from surrounding ground` : `Loses ${f(-v, 2)} cm/day (seepage / aquifer decline)`;
  }
}

export function describeLearned(source: WaterSource, m: LearnedModel, lagged: boolean): LearnedParamView[] {
  return (Object.keys(SPEC) as ParamKey[]).map((key) => {
    const s = SPEC[key];
    const value = m.coef[key] * s.factor;
    const relevant =
      key === "fetch" || key === "spot" || key === "pump" ? source.usedBy.includes(key) : true;
    return {
      key,
      label: s.label,
      value,
      se: m.se[key] * s.factor,
      unit: s.unit,
      meaning: meaningOf(key, value, lagged),
      identified: !m.notIdentified.includes(key),
      relevant,
    };
  });
}
