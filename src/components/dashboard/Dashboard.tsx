"use client";

import { useCallback, useMemo, useState } from "react";
import { PERSONAS, defaultLang, personasFor } from "@/config/personas";
import type { PersonaCategory } from "@/lib/types";
import type { SourcesPayload, SourceView } from "@/lib/view";
import type { DisplayTier } from "@/lib/alerts/tiers";
import type { DispatchMessage, FieldReply } from "@/lib/alerts/dispatch";
import type { Lang } from "@/lib/alerts/warnings";
import { haversineKm } from "@/lib/alerts/nearest";
import Header from "./Header";
import PurposeTabs from "./PurposeTabs";
import PersonaPanel from "./PersonaPanel";
import SourceReadout from "./SourceReadout";
import ProvenanceFooter from "./ProvenanceFooter";
import DispatchLog from "./DispatchLog";
import MapStage from "@/components/map/MapStage";
import BasicPhone from "@/components/phone/BasicPhone";
import DataBadge from "@/components/common/DataBadge";
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

interface DispatchState {
  messages: DispatchMessage[];
  replies: FieldReply[];
  /** Messages from the latest batch (highlighted as NEW). */
  fresh: ReadonlySet<string>;
}

const NO_FRESH: ReadonlySet<string> = new Set();

export default function Dashboard({ initial, initialDispatch }: { initial: SourcesPayload; initialDispatch: DispatchMessage[] }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [clockError, setClockError] = useState<string | null>(null);
  const [tab, setTab] = useState<PersonaCategory>("spot");
  const [personaId, setPersonaId] = useState(personasFor("spot")[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(() => mostUrgent(initial.sources, "spot")?.id ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number; pairId?: string } | null>(null);
  /** Suggested alternative shown on the map; the at-risk source stays selected (its warning is pinned). */
  const [alt, setAlt] = useState<{ fromId: string; toId: string } | null>(null);
  const [dispatch, setDispatch] = useState<DispatchState>({ messages: initialDispatch, replies: [], fresh: NO_FRESH });
  const [phoneLang, setPhoneLang] = useState<Lang | null>(null);
  /** Message to open on the phone; `n` remounts the phone on each request. */
  const [phoneOpen, setPhoneOpen] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });

  const isRelevant = useMemo(() => relevantFor(tab), [tab]);
  const selected = data.sources.find((s) => s.id === selectedId) ?? null;
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

  const altView = useMemo(() => {
    if (!alt || alt.fromId !== selectedId) return null;
    const from = data.sources.find((s) => s.id === alt.fromId);
    const to = data.sources.find((s) => s.id === alt.toId);
    return from && to ? { source: to, km: haversineKm(from, to) } : null;
  }, [alt, selectedId, data.sources]);
  const link = useMemo(
    () => (altView && alt ? { fromId: alt.fromId, toId: alt.toId, km: altView.km } : null),
    [altView, alt],
  );

  const changeTab = (t: PersonaCategory) => {
    setTab(t);
    setPersonaId(personasFor(t)[0].id);
    setSelectedId(mostUrgent(data.sources, t)?.id ?? selectedId);
    setAlt(null);
  };

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setAlt(null);
    setSheetOpen(true);
  }, []);

  /** Select a source and fly the map to it (persona panel links). */
  const focusSource = useCallback((id: string) => {
    setSelectedId(id);
    setAlt((a) => (a && a.fromId === id ? a : null));
    setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  }, []);

  /** Show the route to the suggested alternative, keeping the at-risk source's warning pinned. */
  const showAlt = useCallback((fromId: string, toId: string) => {
    setSelectedId(fromId);
    setAlt({ fromId, toId });
    setFocus((f) => ({ id: fromId, pairId: toId, n: (f?.n ?? 0) + 1 }));
  }, []);

  const openAlt = () => {
    if (!alt) return;
    const id = alt.toId;
    setAlt(null);
    focusSource(id);
  };

  /** Open a logged message on the phone: switch to that persona's tab and inbox. */
  const openOnPhone = (m: DispatchMessage) => {
    setTab(m.category);
    setPersonaId(m.personaId);
    setPhoneOpen((o) => ({ id: m.id, n: o.n + 1 }));
  };

  const pickPersona = (id: string) => {
    setPersonaId(id);
    setPhoneOpen((o) => ({ id: null, n: o.n + 1 }));
  };

  const reply = (m: DispatchMessage, value: 1 | 2) => {
    setDispatch((d) => ({
      ...d,
      replies: [
        ...d.replies,
        { id: `${m.id}|r${d.replies.length}`, date: data.asOf, messageId: m.id, sourceId: m.sourceId, sourceName: m.sourceName, personaId: m.personaId, value },
      ],
    }));
  };

  const changeDate = async (iso: string) => {
    const prevAsOf = data.asOf;
    setBusy(true);
    setClockError(null);
    try {
      const r = await fetch(`/api/sources?asOf=${iso}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const next = (await r.json()) as SourcesPayload;
      setData(next);
      if (next.asOf === next.timeline.demoDate) {
        // Reset: back to demo day, forget everything sent since.
        setDispatch({ messages: initialDispatch, replies: [], fresh: NO_FRESH });
        setPhoneOpen((o) => ({ id: null, n: o.n + 1 }));
      } else if (next.asOf > prevAsOf) {
        const sent = [...new Set(dispatch.messages.map((m) => m.key))];
        const dr = await fetch("/api/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asOf: next.asOf, sent }),
        });
        if (!dr.ok) throw new Error(`dispatch HTTP ${dr.status}`);
        const { messages } = (await dr.json()) as { messages: DispatchMessage[] };
        setDispatch((d) => ({ ...d, messages: [...d.messages, ...messages], fresh: new Set(messages.map((m) => m.id)) }));
        // Land the phone on the newest message for the current persona.
        setPhoneOpen((o) => ({ id: null, n: o.n + 1 }));
      }
    } catch (e) {
      setClockError(`Could not move the clock (${(e as Error).message}). Try again.`);
    } finally {
      setBusy(false);
    }
  };

  const inbox = useMemo(
    () => dispatch.messages.filter((m) => m.personaId === personaId).reverse(),
    [dispatch.messages, personaId],
  );
  const lang: Lang = phoneLang ?? defaultLang(persona);
  const sentHere = useMemo(() => dispatch.messages.filter((m) => m.sourceId === selectedId), [dispatch.messages, selectedId]);
  const repliesHere = useMemo(() => dispatch.replies.filter((r) => r.sourceId === selectedId), [dispatch.replies, selectedId]);

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
              onPersona={pickPersona}
              source={selected}
              sources={data.sources}
              asOf={data.asOf}
              onFocus={focusSource}
              onAlt={showAlt}
              altId={link?.toId ?? null}
            />
          </div>
          <div className="order-1 h-[58vh] min-h-[420px] md:sticky md:top-0 md:order-2 md:h-[min(780px,calc(100vh-24px))] md:min-h-[560px] md:self-start">
            <MapStage sources={data.sources} selectedId={selectedId} onSelect={select} isRelevant={isRelevant} focus={focus} link={link} />
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
            <SourceReadout
              source={selected}
              asOf={data.asOf}
              alt={altView}
              onOpenAlt={openAlt}
              onClearAlt={() => setAlt(null)}
              sent={sentHere}
              replies={repliesHere}
            />
          </aside>
        </div>

        {/* Delivery: simulated phone + dispatch log */}
        <div className="grid grid-cols-1 gap-5 border-t border-border p-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] sm:p-5">
          <div className="grid content-start gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="wc-label">
                Field phone <em>· Warnings as received</em>
              </div>
              <DataBadge provenance="SIMULATED" title="Simulated basic phone: no real SMS is sent" />
            </div>
            <label className="grid gap-1 font-mono text-[11px] text-muted">
              Inbox of
              <select
                className="rounded border border-line2 bg-panel px-2 py-1.5 text-[12px] text-[var(--text)]"
                value={personaId}
                onChange={(e) => {
                  const p = PERSONAS.find((x) => x.id === e.target.value)!;
                  setTab(p.category);
                  pickPersona(p.id);
                }}
              >
                {PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({dispatch.messages.filter((m) => m.personaId === p.id).length})
                  </option>
                ))}
              </select>
            </label>
            <BasicPhone
              key={`${personaId}|${phoneOpen.n}`}
              persona={persona}
              inbox={inbox}
              freshIds={dispatch.fresh}
              replies={dispatch.replies}
              lang={lang}
              onLang={setPhoneLang}
              onReply={reply}
              openId={phoneOpen.id}
            />
          </div>
          <div className="grid min-w-0 content-start gap-2.5">
            <div className="wc-label">
              Dispatch log <em>· Every warning the engine sent</em>
            </div>
            <DispatchLog
              messages={dispatch.messages}
              replies={dispatch.replies}
              freshIds={dispatch.fresh}
              demoDate={data.timeline.demoDate}
              onOpen={openOnPhone}
            />
            <p className="font-mono text-[11px] leading-relaxed text-muted">
              Sent when a source&apos;s tier escalates on the batch clock (never twice for the same source and tier). Field users get Hindi,
              officers English. In a real deployment these go out through a registered SMS sender ID (DLT in India) via an SMS gateway.
            </p>
          </div>
        </div>

        <ProvenanceFooter provenance={data.provenance} />
      </section>
    </div>
  );
}
