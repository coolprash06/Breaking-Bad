import type { NextRequest } from "next/server";
import { clampAsOf, getSources } from "@/lib/data/store";
import { evaluateSource } from "@/lib/alerts/engine";
import type { DisplayTier } from "@/lib/alerts/tiers";

const SEVERITY: Record<DisplayTier, number> = { emergency: 0, warning: 1, nodata: 2, watch: 3, safe: 4 };

/** Active alerts (everything that is not Safe), most severe first. Confidence is in every alert. */
export async function GET(req: NextRequest) {
  const asOf = clampAsOf(req.nextUrl.searchParams.get("asOf"));
  const alerts = getSources()
    .data.map((s) => ({ source: s, status: evaluateSource(s, asOf) }))
    .filter((a) => a.status.tier !== "safe")
    .sort((a, b) => SEVERITY[a.status.tier] - SEVERITY[b.status.tier])
    .map(({ source, status }) => ({
      sourceId: source.id,
      name: source.name,
      tier: status.tier,
      riskTier: status.riskTier,
      since: status.since,
      confidence: status.confidence,
      summary: status.summary,
      reasons: status.reasons.map((r) => r.text),
      signalsAgreeing: status.signals.agreeing,
    }));
  return Response.json({ asOf, alerts });
}
