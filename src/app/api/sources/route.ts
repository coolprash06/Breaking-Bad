import type { NextRequest } from "next/server";
import { clampAsOf, getProvenance, getSources, getTimeline } from "@/lib/data/store";
import { evaluateSource } from "@/lib/alerts/engine";

/** All sources with their current risk status as of the demo clock date. */
export async function GET(req: NextRequest) {
  const asOf = clampAsOf(req.nextUrl.searchParams.get("asOf"));
  const sources = getSources();
  const items = sources.data.map((s) => {
    const st = evaluateSource(s, asOf);
    return {
      ...s,
      status: {
        tier: st.tier,
        riskTier: st.riskTier,
        rawTier: st.rawTier,
        pending: st.pending,
        since: st.since,
        confidence: st.confidence,
        label: st.label,
        windowLabel: st.windowLabel,
        summary: st.summary,
        ttf: st.ttf,
        currentLevel: st.currentLevel,
        lastReading: st.lastReading,
        startKind: st.startKind,
        topReasons: st.reasons.slice(0, 3).map((r) => r.text),
      },
    };
  });
  return Response.json({
    asOf,
    timeline: getTimeline(),
    provenance: getProvenance(),
    sources: items,
  });
}
