"use client";

import { useCallback, useMemo, useState } from "react";
import { personasFor } from "@/config/personas";
import type { PersonaCategory } from "@/lib/types";
import type { SourcesPayload, SourceView } from "@/lib/view";
import type { DisplayTier } from "@/lib/alerts/tiers";
import Header from "./Header";
import PurposeTabs from "./PurposeTabs";
import PersonaPanel from "./PersonaPanel";
import SourceReadout from "./SourceReadout";
import ProvenanceFooter from "./ProvenanceFooter";
import MapStage from "@/components/map/MapStage";
import { RiskIcon, shortConfidence } from "@/components/map/RiskMarker";

const SEVERITY: Record<DisplayTier, number> = { emergency: 0, warning: 1, nodata: 2, watch: 3, safe: 4 };

/** One engine, four lenses: a tab only changes which sources are highlighted. */
function relevantFor(tab: PersonaCategory) {
  return (s: SourceView) => (tab === "manage" ? true : s.usedBy.includes(tab));
}

function mostUrgent(sources: SourceView[], tab: PersonaCategory): SourceView | null {
  const rel = sources.filter(relevantFor(tab));
  const sorted = [...rel].sort(
    (a, b) =>
      SEVERITY[a.status.tier] - SEVERITY[b.status.tier] ||
      (a.status.ttf.p50 ?? Infinity) - (b.status.ttf.p50 ?? Infinity),
  );
  return sorted[0] ?? null;
}

export default function Dashboard({ initial }: { initial: SourcesPayload }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [clockError, setClockError] = useState<string | null>(null);
  const [tab, setTab] = useState<PersonaCategory>("spot");
  const [personaId, setPersonaId] = useState(personasFor("spot")[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(() => mostUrgent(initial.sources, "spot")?.id ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);

  const isRelevant = useMemo(() => relevantFor(tab), [tab]);
  const selected = data.sources.find((s) => s.id === selectedId) ?? null;

  const changeTab = (t: PersonaCategory) => {
    setTab(t);
    setPersonaId(personasFor(t)[0].id);
    setSelectedId(mostUrgent(data.sources, t)?.id ?? selectedId);
  };

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  }, []);

  /** Select a source and fly the map to it (persona panel links). */
  const focusSource = useCallback((id: string) => {
    setSelectedId(id);
    setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  }, []);

  const changeDate = async (iso: string) => {
    setBusy(true);
    setClockError(null);
    try {
      const r = await fetch(`/api/sources?asOf=${iso}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as SourcesPayload);
    } catch (e) {
      setClockError(`Could not move the clock (${(e as Error).message}). Try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-0 sm:px-4 sm:py-4">
      <section
        className="overflow-hidden border-border sm:rounded-[14px] sm:border"
        style={{ background: "color-mix(in srgb, var(--panel) 55%, transparent)" }}
      >
        <Header asOf={data.asOf} demoDate={data.timeline.demoDate} end={data.timeline.end} busy={busy} onChange={changeDate} />
        {clockError && <p className="border-b border-border px-5 py-2 font-mono text-[12px] text-risk-emergency">{clockError}</p>}
        <PurposeTabs value={tab} onChange={changeTab} />

        <div className="grid grid-cols-1 pb-16 md:grid-cols-[240px_minmax(0,1fr)] md:pb-0 xl:grid-cols-[270px_minmax(0,1fr)_340px]">
          <div className="order-2 border-border md:order-1 md:border-r">
            <PersonaPanel
              tab={tab}
              personaId={personaId}
              onPersona={setPersonaId}
              source={selected}
              sources={data.sources}
              asOf={data.asOf}
              onFocus={focusSource}
            />
          </div>
          <div className="order-1 h-[58vh] min-h-[420px] md:sticky md:top-0 md:order-2 md:h-[min(780px,calc(100vh-24px))] md:min-h-[560px] md:self-start">
            <MapStage sources={data.sources} selectedId={selectedId} onSelect={select} isRelevant={isRelevant} focus={focus} />
          </div>

          {/* Source readout: right column on wide screens, full row on tablets, bottom sheet on phones. */}
          <aside
            aria-label="Source details"
            className={[
              "order-3 min-w-0 md:col-span-2 md:border-t md:border-border md:p-4 xl:col-span-1 xl:border-t-0 xl:border-l",
              "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:max-h-[78vh] max-md:overflow-y-auto max-md:rounded-t-2xl max-md:border-t max-md:border-line2 max-md:bg-panel max-md:px-4 max-md:pb-6 max-md:shadow-[0_-12px_30px_-12px_rgba(0,0,0,0.6)] max-md:transition-transform max-md:duration-300",
              sheetOpen ? "" : "max-md:translate-y-[calc(100%-58px)]",
            ].join(" ")}
          >
            <button
              className="sticky top-0 z-10 -mx-4 mb-2 flex w-[calc(100%+2rem)] items-center gap-2 bg-panel px-4 pt-2.5 pb-2 md:hidden"
              onClick={() => setSheetOpen((o) => !o)}
              aria-expanded={sheetOpen}
            >
              <span className="absolute top-1.5 left-1/2 h-1 w-11 -translate-x-1/2 rounded bg-line2" aria-hidden />
              {selected && <RiskIcon tier={selected.status.tier} size={14} />}
              <span className="mt-1.5 font-mono text-[12px]">
                {selected ? `${selected.name} · ${shortConfidence(selected.status)}` : "Source details"}
              </span>
              <span className="mt-1.5 ml-auto font-mono text-[11px] text-muted">{sheetOpen ? "Close" : "Open"}</span>
            </button>
            <div className="wc-label mb-3 max-md:hidden">
              Lab readout <em>· Source details</em>
            </div>
            <SourceReadout source={selected} asOf={data.asOf} />
          </aside>
        </div>

        <ProvenanceFooter provenance={data.provenance} />
      </section>
    </div>
  );
}
