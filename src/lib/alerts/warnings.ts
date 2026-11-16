/**
 * Persona-specific warning text (F5). Pure: works on the server (SMS, Phase 4)
 * and in the browser (persona panel). Plain, serious wording; confidence in
 * every message; a nearest-safe-source line in every field warning.
 */
import type { WaterSource } from "@/lib/types";
import type { Persona } from "@/config/personas";
import { addDays, formatShort } from "@/lib/time";
import type { DisplayTier, RiskTier } from "./tiers";
import { formatKm, nearestSafe, type Candidate, type NearestResult } from "./nearest";

/** The slice of a source's status the warnings need (matches /api/sources). */
export interface StatusLite {
  tier: DisplayTier;
  riskTier: RiskTier;
  confidence: number;
  windowLabel: string;
  ttf: { p10: number | null; p50: number | null; p90: number | null };
  lastReading: { date: string; value: number; daysAgo: number } | null;
}

export interface SourceLite extends WaterSource {
  status: StatusLite;
}

export interface PersonaWarning {
  /** Short message, as it would arrive by SMS. */
  text: string;
  /** Is this an actual warning (Watch or worse, or no data) rather than an all-clear? */
  isAlert: boolean;
  nearest: NearestResult;
}

const NEED_WORD = {
  drink: "drinking water",
  animals: "water for animals",
  onspot: "source for bathing and washing",
  none: "",
} as const;

function pct(c: number): string {
  return `${Math.round(c * 100)}%`;
}

/** "may run dry in 1-3 weeks (70% confident)" */
function outlook(s: StatusLite): string {
  const w = s.windowLabel.replace(/^Likely to fail in /, "may run dry in ");
  return `${w.charAt(0).toLowerCase()}${w.slice(1)} (${pct(s.confidence)} confident)`;
}

/** Date to act by: the early (P10) edge of the failure window. */
function actBy(s: StatusLite, asOf: string): string | null {
  const d = s.ttf.p10 ?? s.ttf.p50;
  if (d === null) return null;
  return formatShort(addDays(asOf, Math.max(1, Math.floor(d))));
}

function alternativeLine(persona: Persona, n: NearestResult): string {
  const what = NEED_WORD[persona.need];
  if (n.within) {
    return `Nearest safe ${what}: ${n.within.source.name}, ${formatKm(n.within.km)} away.`;
  }
  const far = n.closest ? ` The closest is ${n.closest.source.name}, ${formatKm(n.closest.km)} away.` : "";
  return `No safe ${what} found within ${persona.maxKm} km.${far} Contact the Panchayat.`;
}

export function personaWarning(persona: Persona, source: SourceLite, all: SourceLite[], asOf: string): PersonaWarning {
  const s = source.status;
  const candidates: Candidate[] = all.map((x) => ({ source: x, tier: x.status.tier }));
  const nearest = nearestSafe(source, candidates, persona.need, persona.maxKm);
  const isAlert = s.tier !== "safe";
  const by = actBy(s, asOf);

  if (s.tier === "nodata") {
    const days = s.lastReading ? `${s.lastReading.daysAgo} days` : "a long time";
    const base = `${source.name}: no sensor reading for ${days}. Last estimate: ${outlook(s)}. Please check the level and reply 1 = low, 2 = fine.`;
    return { text: persona.need === "none" ? base : `${base} ${alternativeLine(persona, nearest)}`, isAlert, nearest };
  }

  if (!isAlert) {
    return {
      text: `${source.name} is safe: ${s.windowLabel.toLowerCase()} (${pct(s.confidence)} confident). No action needed.`,
      isAlert,
      nearest,
    };
  }

  const head =
    s.tier === "watch"
      ? `${source.name} is dropping faster than usual: ${outlook(s)}.`
      : s.tier === "emergency"
        ? `ACT NOW: ${source.name} ${outlook(s)}.`
        : `${source.name} ${outlook(s)}.`;
  switch (persona.id) {
    case "herder": {
      const move = nearest.within
        ? `Move herds to ${nearest.within.source.name} (${formatKm(nearest.within.km)})${by ? ` by ${by}` : ""}.`
        : alternativeLine(persona, nearest);
      return { text: `${head} ${move}`, isAlert, nearest };
    }
    case "farmer":
      return {
        text: `${head} Cutting pumping now keeps the shared water alive longer. See the suggested cut below.`,
        isAlert,
        nearest,
      };
    case "panchayat":
    case "district":
    case "ngo": {
      const p = source.people;
      const who = [
        p.households ? `${p.households} households` : "",
        p.animals ? `${p.animals.toLocaleString("en-IN")} animals` : "",
        p.farms ? `${p.farms} farms` : "",
      ].filter(Boolean).join(", ");
      const drink = nearestSafe(source, candidates, "drink", 8);
      const plan = drink.within
        ? `Safe drinking water nearby: ${drink.within.source.name} (${formatKm(drink.within.km)}).`
        : "No safe drinking source within 8 km: plan tanker supply.";
      return { text: `${head} Affects ${who || "no registered users"}. ${plan}`, isAlert, nearest };
    }
    default:
      return { text: `${head}${by ? ` Plan before ${by}.` : ""} ${alternativeLine(persona, nearest)}`, isAlert, nearest };
  }
}
