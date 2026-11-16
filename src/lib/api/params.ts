/** Parsing of shared query parameters for the API routes. */
import type { UsageCategory } from "@/lib/types";
import { USAGE_CATEGORIES } from "@/lib/types";
import type { UsageCut } from "@/lib/forecast/ensemble";

/** cut_fetch / cut_spot / cut_pump as fractions in [0, 0.9]. */
export function parseUsageCut(sp: URLSearchParams): UsageCut {
  const cut: UsageCut = {};
  for (const c of USAGE_CATEGORIES as readonly UsageCategory[]) {
    const raw = sp.get(`cut_${c}`);
    if (raw === null) continue;
    const v = Number(raw);
    if (Number.isFinite(v) && v > 0) cut[c] = Math.min(0.9, v);
  }
  return cut;
}
