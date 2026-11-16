/**
 * Risk tiers (F1 colours) and the rules that set them (F4).
 * Colour = risk only. Confidence is reported separately.
 */
import { NO_DATA_GREY_DAYS } from "@/config/thresholds";

export type RiskTier = "safe" | "watch" | "warning" | "emergency";
export type DisplayTier = RiskTier | "nodata";

export const TIER_RANK: Record<RiskTier, number> = { safe: 0, watch: 1, warning: 2, emergency: 3 };
const BY_RANK: RiskTier[] = ["safe", "watch", "warning", "emergency"];

export const TIER_META: Record<DisplayTier, { label: string; colorVar: string; meaning: string }> = {
  safe: { label: "Safe", colorVar: "var(--risk-safe)", meaning: "No failure expected soon" },
  watch: { label: "Watch", colorVar: "var(--risk-watch)", meaning: "Dropping faster than usual" },
  warning: { label: "Warning", colorVar: "var(--risk-warning)", meaning: "Likely to fail in weeks" },
  emergency: { label: "Emergency", colorVar: "var(--risk-emergency)", meaning: "Act now" },
  nodata: { label: "No recent data", colorVar: "var(--risk-nodata)", meaning: "Sensor silent or gap" },
};

export const TIER_RULES = {
  emergencyDays: 14, // median time-to-failure
  warningDays: 56, // 8 weeks
  watchP10Days: 56, // a 1-in-10 chance of failing within 8 weeks
  persistenceDays: 3, // a tier must hold this many consecutive days to change
  minAgreeingSignals: 2, // to go above Watch
  noDataDays: NO_DATA_GREY_DAYS,
} as const;

export interface RawTierInput {
  currentLevel: number;
  failureLevel: number;
  ttfP10: number | null;
  ttfP50: number | null;
  fastDrop: boolean;
  agreeing: number;
}

export interface RawTier {
  tier: RiskTier;
  /** Forecast alone said Warning/Emergency but fewer than 2 signals agreed. */
  capped: boolean;
  /** Level already at/below failure: escalates without waiting. */
  hard: boolean;
}

export function rawTier(i: RawTierInput): RawTier {
  if (i.currentLevel <= i.failureLevel) return { tier: "emergency", capped: false, hard: true };
  let tier: RiskTier = "safe";
  if (i.ttfP50 !== null && i.ttfP50 <= TIER_RULES.emergencyDays) tier = "emergency";
  else if (i.ttfP50 !== null && i.ttfP50 <= TIER_RULES.warningDays) tier = "warning";
  // "Faster than usual" only matters if failure is at least plausible within the horizon
  // (avoids false alarms when e.g. rabi pumping starts on a deep, healthy borewell).
  else if ((i.fastDrop && i.ttfP10 !== null) || (i.ttfP10 !== null && i.ttfP10 <= TIER_RULES.watchP10Days)) {
    tier = "watch";
  }

  if (TIER_RANK[tier] >= TIER_RANK.warning && i.agreeing < TIER_RULES.minAgreeingSignals) {
    return { tier: "watch", capped: true, hard: false };
  }
  return { tier, capped: false, hard: false };
}

export interface PersistenceResult {
  tier: RiskTier;
  /** Index (into the input) where the current displayed tier began. */
  sinceIdx: number;
  /** A change that is waiting for persistence: tier it is heading to and days held so far. */
  pending: { to: RiskTier; daysHeld: number } | null;
}

/**
 * Persistence + hysteresis over a window of daily raw tiers (oldest first).
 * Escalate only after the higher tier held for N consecutive days;
 * step down only after the lower tier held for N consecutive days.
 * Hard emergencies (level already at failure) apply immediately.
 */
export function applyPersistence(raw: RawTier[], n: number = TIER_RULES.persistenceDays): PersistenceResult {
  let shown: RiskTier = raw[0].tier;
  let since = 0;
  for (let d = 1; d < raw.length; d++) {
    const r = raw[d];
    if (r.hard && r.tier !== shown) {
      shown = r.tier;
      since = d;
      continue;
    }
    if (d + 1 < n) continue;
    const lastN = raw.slice(d - n + 1, d + 1).map((x) => TIER_RANK[x.tier]);
    const cur = TIER_RANK[shown];
    if (lastN.every((t) => t > cur)) {
      shown = BY_RANK[Math.min(...lastN)];
      since = d - n + 1;
    } else if (lastN.every((t) => t < cur)) {
      shown = BY_RANK[Math.max(...lastN)];
      since = d - n + 1;
    }
  }
  const last = raw[raw.length - 1];
  let pending: PersistenceResult["pending"] = null;
  if (last.tier !== shown) {
    let held = 0;
    for (let d = raw.length - 1; d >= 0; d--) {
      const higher = TIER_RANK[last.tier] > TIER_RANK[shown];
      const ok = higher ? TIER_RANK[raw[d].tier] > TIER_RANK[shown] : TIER_RANK[raw[d].tier] < TIER_RANK[shown];
      if (!ok) break;
      held++;
    }
    pending = { to: last.tier, daysHeld: held };
  }
  return { tier: shown, sinceIdx: since, pending };
}
