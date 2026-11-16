"use client";

import { useEffect, useState } from "react";
import { personasFor, PURPOSE_TABS, type Persona } from "@/config/personas";
import { personaWarning } from "@/lib/alerts/warnings";
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
}

/** Cat 3: what a 30% pumping cut buys, from the same forecast engine. */
function PumpScenario({ source, asOf }: { source: SourceView; asOf: string }) {
  const key = `${source.id}|${asOf}`;
  const [res, setRes] = useState<{ key: string; label: string | null }>({ key: "", label: null });
  useEffect(() => {
    if (!source.usedBy.includes("pump")) return;
    let live = true;
    fetch(`/api/forecast/${source.id}?asOf=${asOf}&cut_pump=0.3`)
      .then((r) => r.json())
      .then((d: { scenario?: { label: string } | null }) => live && setRes({ key, label: d.scenario?.label ?? null }))
      .catch(() => live && setRes({ key, label: null }));
    return () => {
      live = false;
    };
  }, [key, source.id, source.usedBy, asOf]);

  if (!source.usedBy.includes("pump")) {
    return <p className="text-[12.5px] text-muted">{source.name} is not pumped by farms. Pick a borewell or a shared village well.</p>;
  }
  return (
    <p className="font-mono text-[12px] leading-relaxed">
      <span className="text-muted">If pumping is cut 30%: </span>
      {res.key === key ? (res.label ?? "No change in the forecast") : "Re-running forecast…"}
    </p>
  );
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
}: { p: Persona; on: boolean; onClick(): void } & Pick<Props, "source" | "sources" | "asOf" | "onFocus">) {
  const w = on && source ? personaWarning(p, source, sources, asOf) : null;
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
            {w.isAlert ? "Warning they receive" : "Status they receive"} · {source.name}
          </div>
          <p className="rounded-md border border-dashed border-line2 bg-panel2 px-2.5 py-2 font-mono text-[12px] leading-relaxed">{w.text}</p>
          <div className="flex flex-wrap gap-1.5">
            <SourceLink id={source.id} label={`Show ${source.name}`} onFocus={onFocus} />
            {w.isAlert && w.nearest.within && (
              <SourceLink id={w.nearest.within.source.id} label={`${w.nearest.within.source.name} · ${formatKm(w.nearest.within.km)}`} onFocus={onFocus} />
            )}
          </div>
          {p.id === "farmer" && <PumpScenario source={source} asOf={asOf} />}
        </div>
      )}
    </div>
  );
}

export default function PersonaPanel({ tab, personaId, onPersona, source, sources, asOf, onFocus }: Props) {
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
        />
      ))}
    </aside>
  );
}
