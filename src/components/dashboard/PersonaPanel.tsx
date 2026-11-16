"use client";

import { useEffect, useState } from "react";
import { personasFor, PUMP_CUT, PURPOSE_TABS, receivesTier, type Persona } from "@/config/personas";
import { personaWarning, type ScenarioLite } from "@/lib/alerts/warnings";
import { smsInfo } from "@/lib/sms/segments";
import { formatKm } from "@/lib/alerts/nearest";
import type { PersonaCategory } from "@/lib/types";
import type { SourceView } from "@/lib/view";
import { RISK_ORDER, RISK_UI, RiskIcon } from "@/components/map/RiskMarker";

interface Props {
  tab: PersonaCategory;
  personaId: string;
  onPersona(id: string): void;
  source: SourceView | null;
  sources: SourceView[];
  asOf: string;
  onFocus(id: string): void;
  /** Show the suggested alternative on the map while keeping this warning pinned. */
  onAlt(fromId: string, toId: string): void;
  /** The alternative currently shown on the map, if any. */
  altId: string | null;
}

interface ScenarioState {
  key: string;
  label: string | null;
  lite: ScenarioLite | null;
}

/** Cat 3: what a pumping cut buys, re-run by the same forecast engine. */
function usePumpScenario(source: SourceView | null, asOf: string, enabled: boolean) {
  const pumped = !!source?.usedBy.includes("pump");
  const key = source ? `${source.id}|${asOf}` : "";
  const [res, setRes] = useState<ScenarioState>({ key: "", label: null, lite: null });
  useEffect(() => {
    if (!enabled || !source || !pumped) return;
    let live = true;
    fetch(`/api/forecast/${source.id}?asOf=${asOf}&cut_pump=${PUMP_CUT}`)
      .then((r) => r.json())
      .then((d: { scenario?: { label: string; extraDays: number | null; beyondHorizon: boolean } | null }) => {
        if (!live) return;
        const sc = d.scenario;
        setRes({
          key,
          label: sc?.label ?? null,
          lite: sc ? { cutPct: Math.round(PUMP_CUT * 100), extraDays: sc.extraDays, beyondHorizon: sc.beyondHorizon } : null,
        });
      })
      .catch(() => live && setRes({ key, label: null, lite: null }));
    return () => {
      live = false;
    };
  }, [enabled, key, source, pumped, asOf]);
  return { pumped, ready: res.key === key, label: res.key === key ? res.label : null, lite: res.key === key ? res.lite : null };
}

function ManageSummary({ sources }: { sources: SourceView[] }) {
  const counts = RISK_ORDER.map((t) => [t, sources.filter((s) => s.status.tier === t).length] as const);
  const atRisk = sources.filter((s) => s.status.tier !== "safe");
  const hh = atRisk.reduce((a, s) => a + s.people.households, 0);
  const an = atRisk.reduce((a, s) => a + s.people.animals, 0);
  const farms = atRisk.reduce((a, s) => a + s.people.farms, 0);
  return (
    <div className="wc-card grid gap-2 p-3">
      <div className="grid grid-cols-5 gap-1 text-center">
        {counts.map(([t, n]) => (
          <div key={t} className="grid justify-items-center gap-0.5" title={RISK_UI[t].label}>
            <RiskIcon tier={t} size={14} />
            <span className="font-mono text-[15px] tabular-nums">{n}</span>
          </div>
        ))}
      </div>
      <p className="font-mono text-[11.5px] leading-relaxed text-muted">
        Not safe: {atRisk.length} sources · {hh} households · {an.toLocaleString("en-IN")} animals · {farms} farms
      </p>
    </div>
  );
}

function SourceLink({ id, label, onFocus }: { id: string; label: string; onFocus(id: string): void }) {
  return (
    <button
      className="inline-flex items-center gap-1 rounded border border-line2 px-1.5 py-0.5 font-mono text-[10.5px] tracking-[0.06em] uppercase hover:border-lab hover:text-lab"
      onClick={() => onFocus(id)}
    >
      <span aria-hidden>◎</span>
      {label}
    </button>
  );
}

function PersonaCard({
  p,
  on,
  onClick,
  source,
  sources,
  asOf,
  onFocus,
  onAlt,
  altId,
}: { p: Persona; on: boolean; onClick(): void } & Pick<Props, "source" | "sources" | "asOf" | "onFocus" | "onAlt" | "altId">) {
  const pump = usePumpScenario(source, asOf, on && p.id === "farmer");
  const w = on && source ? personaWarning(p, source, sources, asOf, { scenario: pump.lite }) : null;
  const seg = w ? smsInfo(w.text).segments : 0;
  /** Field users are not messaged at Watch (alert-fatigue rule). */
  const held = !!w && !!source && w.isAlert && !receivesTier(p, source.status.tier);
  return (
    <div
      className="wc-card grid gap-1 px-3 py-2.5 text-left"
      style={on ? { borderColor: "var(--lab)" } : undefined}
    >
      <button className="grid cursor-pointer gap-1 text-left" aria-pressed={on} onClick={onClick}>
        <span className="text-[14px] font-semibold">{p.name}</span>
        <span className="font-hindi text-[13px] opacity-85" lang="hi">
          {p.nameHi}
        </span>
        <span className="text-[12.5px] leading-snug text-muted">{p.story}</span>
      </button>
      {w && source && (
        <div className="mt-1 grid gap-1.5">
          <div className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
            {!w.isAlert ? "Status they would see" : held ? "Not sent at Watch · preview" : "Warning they receive"} · {source.name}
          </div>
          {held && (
            <p className="text-[12px] leading-snug text-muted">
              At Watch only the Panchayat and officers are told, to avoid false alarms. This group gets it from Warning upward.
            </p>
          )}
          <div className={`grid gap-1.5 rounded-md border border-dashed border-line2 bg-panel2 px-2.5 py-2 ${held ? "opacity-60" : ""}`}>
            <p className="font-mono text-[12px] leading-relaxed">{w.text}</p>
            <p className="font-hindi text-[13px] leading-relaxed opacity-85" lang="hi">
              {w.hi}
            </p>
            <p className="font-mono text-[10px] text-faint">
              {seg} SMS EN · {smsInfo(w.hi).segments} SMS HI
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <SourceLink id={source.id} label={`Show ${source.name}`} onFocus={onFocus} />
            {w.isAlert && w.nearest.within && (
              <button
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10.5px] tracking-[0.06em] uppercase hover:border-lab hover:text-lab ${
                  altId === w.nearest.within.source.id ? "border-lab text-lab" : "border-line2"
                }`}
                onClick={() => onAlt(source.id, w.nearest.within!.source.id)}
                title="Show the route on the map. This warning stays pinned."
              >
                <span aria-hidden>⇢</span>
                {w.nearest.within.source.name} · {formatKm(w.nearest.within.km)}
              </button>
            )}
          </div>
          {p.id === "farmer" && (
            <p className="font-mono text-[11.5px] leading-relaxed text-muted">
              {!pump.pumped
                ? `${source.name} is not pumped by farms. Pick a borewell or a shared village well.`
                : pump.ready
                  ? `Engine re-run, pumping cut ${Math.round(PUMP_CUT * 100)}%: ${pump.label ?? "no change in the forecast"}`
                  : "Re-running forecast with less pumping…"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PersonaPanel({ tab, personaId, onPersona, source, sources, asOf, onFocus, onAlt, altId }: Props) {
  const personas = personasFor(tab);
  const focus = PURPOSE_TABS.find((t) => t.id === tab)?.focus;
  return (
    <aside className="grid min-w-0 content-start gap-3 p-4" aria-label="Personas">
      <div className="wc-label">
        Field notes <em>· People affected</em>
      </div>
      <p className="-mt-1 text-[12px] text-muted">Map shows: {focus}</p>
      {tab === "manage" && <ManageSummary sources={sources} />}
      {personas.map((p) => (
        <PersonaCard
          key={p.id}
          p={p}
          on={p.id === personaId}
          onClick={() => onPersona(p.id)}
          source={source}
          sources={sources}
          asOf={asOf}
          onFocus={onFocus}
          onAlt={onAlt}
          altId={altId}
        />
      ))}
    </aside>
  );
}
