import { clampAsOf, getProvenance, getSnapshot, getSources, getTimeline } from "@/lib/data/store";
import { evaluateSource } from "@/lib/alerts/engine";
import type { SourcesPayload } from "@/lib/view";

/** All sources with their risk status on the demo clock date. Used by /api/sources and the main page. */
export function buildSourcesPayload(requestedAsOf?: string | null): SourcesPayload {
  const asOf = clampAsOf(requestedAsOf);
  const snap = getSnapshot(asOf);
  const sources = getSources().data.map((s) => {
    const st = evaluateSource(s, asOf);
    const pts = snap.ndvi.data[s.id] ?? [];
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
        window: st.window,
        reasonSms: st.reasons.find((r) => r.sms)?.sms ?? null,
        summary: st.summary,
        ttf: st.ttf,
        currentLevel: st.currentLevel,
        lastReading: st.lastReading,
        startKind: st.startKind,
        topReasons: st.reasons.slice(0, 3).map((r) => r.text),
        satellite: {
          ndvi: st.signals.ndvi.latest,
          lastClear: st.signals.ndvi.latestDate,
          cloudySince: st.signals.ndvi.skippedCloudy,
          scenes: pts.length,
          cloudy: pts.filter((p) => p.cloudy).length,
          provenance: snap.ndvi.provenance,
        },
      },
    };
  });
  return { asOf, timeline: getTimeline(), provenance: getProvenance(), sources };
}
