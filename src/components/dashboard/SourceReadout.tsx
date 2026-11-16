"use client";

import { useEffect, useState } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { sourceTypeLabel } from "@/config/sourceTypes";
import { DISTRICTS } from "@/config/regions";
import { formatShort } from "@/lib/time";
import type { Provenance } from "@/lib/types";
import type { SourceView } from "@/lib/view";
import DataBadge from "@/components/common/DataBadge";
import { RISK_UI, RiskPill, shortConfidence } from "@/components/map/RiskMarker";

interface Detail {
  asOf: string;
  history: { date: string; level: number | null; glitch?: boolean }[];
  forecast: { date: string; p10: number; p50: number; p90: number }[];
  status: { reasons: { text: string }[] };
  provenance: { readings: Provenance };
  learned: { r2: number; nDaysCovered: number };
  widening: { factor: number };
}

interface ChartRow {
  date: string;
  level?: number | null;
  /** A reading the model rejected as a sensor glitch (drawn as an x, not in the line). */
  glitch?: number | null;
  p50?: number;
  band?: [number, number];
}

const USE_LABEL = { fetch: "Fetch & carry", spot: "Use on spot", pump: "Pump at scale" } as const;

/** Small "x" for a rejected reading. */
function GlitchMark(props: { cx?: number; cy?: number; payload?: ChartRow }) {
  const { cx, cy, payload } = props;
  // Recharts calls the shape for every row; draw only real glitches.
  if (payload?.glitch == null || cx === undefined || cy === undefined || !Number.isFinite(cy)) return <g />;
  return (
    <path
      d={`M${cx - 3.5} ${cy - 3.5}L${cx + 3.5} ${cy + 3.5}M${cx + 3.5} ${cy - 3.5}L${cx - 3.5} ${cy + 3.5}`}
      stroke="var(--risk-emergency)"
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  );
}

function LevelChart({ d, failure }: { d: Detail; failure: number }) {
  const hist = d.history.slice(-42);
  const rows: ChartRow[] = [
    ...hist.map((h) => (h.glitch ? { date: h.date, level: null, glitch: h.level } : { date: h.date, level: h.level })),
    ...d.forecast
      .filter((_, i) => i % 2 === 0 || i === d.forecast.length - 1)
      .slice(0, 46)
      .map((f) => ({ date: f.date, p50: f.p50, band: [f.p10, f.p90] as [number, number] })),
  ];
  // Join the forecast to the last reading so the line is continuous.
  const last = [...hist].reverse().find((h) => h.level !== null && !h.glitch);
  if (last) {
    const i = rows.findIndex((r) => r.date === last.date);
    if (i >= 0) rows[i] = { ...rows[i], p50: last.level as number, band: [last.level as number, last.level as number] };
  }
  const tick = { fontSize: 9, fill: "var(--muted)", fontFamily: "var(--font-mono)" };
  const nGlitch = rows.filter((r) => r.glitch != null).length;
  return (
    <div className="w-full" role="img" aria-label="Water level: last 6 weeks and forecast with P10 to P90 band">
      <div className="h-[150px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 6, right: 18, bottom: 0, left: -22 }}>
          <XAxis
            dataKey="date"
            tick={tick}
            tickFormatter={(v: string) => formatShort(v)}
            minTickGap={36}
            padding={{ left: 4, right: 10 }}
            interval="preserveStartEnd"
            stroke="var(--line)"
          />
          <YAxis tick={tick} stroke="var(--line)" domain={[0, "auto"]} tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--line2)", fontFamily: "var(--font-mono)", fontSize: 11 }}
            labelFormatter={(v) => formatShort(String(v))}
            formatter={(v, name) => {
              if (Array.isArray(v)) return [`${Number(v[0]).toFixed(2)}–${Number(v[1]).toFixed(2)} m`, "P10–P90"];
              if (name === "glitch") return [`${Number(v).toFixed(2)} m`, "Sensor glitch - ignored by the model"];
              return [`${Number(v).toFixed(2)} m`, name === "level" ? "Reading" : "Forecast (median)"];
            }}
          />
          <Area dataKey="band" stroke="none" fill="var(--risk-warning)" fillOpacity={0.18} isAnimationActive={false} />
          <Line dataKey="level" stroke="var(--text)" strokeWidth={1.6} dot={false} connectNulls={false} isAnimationActive={false} />
          <Scatter dataKey="glitch" name="glitch" isAnimationActive={false} shape={GlitchMark} legendType="none" />
          <Line dataKey="p50" stroke="var(--risk-warning)" strokeWidth={1.6} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <ReferenceLine y={failure} stroke="var(--risk-emergency)" strokeDasharray="3 3" label={{ value: "fails", position: "insideBottomLeft", fontSize: 9, fill: "var(--risk-emergency)" }} />
          <ReferenceLine x={d.asOf} stroke="var(--lab)" label={{ value: "TODAY", position: "insideTopRight", fontSize: 9, fill: "var(--lab)" }} />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      {nGlitch > 0 && (
        <p className="mt-0.5 font-mono text-[10px] text-muted">
          <span className="text-risk-emergency">×</span> {nGlitch === 1 ? "1 reading" : `${nGlitch} readings`} ignored by the model as sensor glitches
        </p>
      )}
    </div>
  );
}

export default function SourceReadout({ source, asOf }: { source: SourceView | null; asOf: string }) {
  const key = source ? `${source.id}|${asOf}` : "";
  const [detail, setDetail] = useState<{ key: string; d: Detail | null; error: string | null }>({ key: "", d: null, error: null });

  useEffect(() => {
    if (!source) return;
    let live = true;
    fetch(`/api/forecast/${source.id}?asOf=${asOf}`)
      .then((r) => (r.ok ? (r.json() as Promise<Detail>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => live && setDetail({ key, d, error: null }))
      .catch((e: Error) => live && setDetail({ key, d: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [key, source, asOf]);

  if (!source) {
    return <p className="p-4 text-sm text-muted">Select a source on the map to see its readout.</p>;
  }

  const st = source.status;
  const d = detail.key === key ? detail.d : null;
  const reasons = d ? d.status.reasons.map((r) => r.text) : st.topReasons;
  const p = source.people;
  const region = DISTRICTS[source.district];

  return (
    <div className="grid content-start gap-3">
      <div className="wc-card grid gap-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-[30px] leading-none tracking-[0.04em]">{source.name}</h2>
            <p className="mt-1 font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase">
              {sourceTypeLabel(source.type, source.region)} · {region.label} · {source.id}
            </p>
          </div>
          <RiskPill tier={st.tier} />
        </div>

        <div className="font-mono text-[14px] leading-snug font-medium">
          {st.windowLabel}
          <br />
          <span className="text-muted">
            {shortConfidence(st)} confident
          </span>
        </div>
        {st.pending && (
          <p className="font-mono text-[11px] text-amber">
            Moving to {RISK_UI[st.pending.to].label}: held {st.pending.daysHeld}/{st.pending.needed} days
          </p>
        )}

        {d ? (
          <LevelChart d={d} failure={source.failureLevelM} />
        ) : (
          <div className="grid h-[150px] place-items-center font-mono text-[11px] text-muted">
            {detail.key === key && detail.error ? `Forecast did not load (${detail.error})` : "Calibrating forecast…"}
          </div>
        )}

        <ul className="grid list-disc gap-1 pl-[18px] text-[13px] marker:text-amber">
          {reasons.slice(0, 4).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[12px] tabular-nums">
          <dt className="text-muted">Level now</dt>
          <dd className="text-right">{st.currentLevel.toFixed(2)} m</dd>
          <dt className="text-muted">Fails at</dt>
          <dd className="text-right">{source.failureLevelM.toFixed(2)} m</dd>
          <dt className="text-muted">Last reading</dt>
          <dd className="text-right">{st.lastReading ? `${formatShort(st.lastReading.date)} · ${st.lastReading.daysAgo} d ago` : "none"}</dd>
          {d && (
            <>
              <dt className="text-muted">Model fit</dt>
              <dd className="text-right">
                R² {d.learned.r2.toFixed(2)} · {d.learned.nDaysCovered} d
              </dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-muted">
          <DataBadge provenance={d?.provenance.readings ?? "SIMULATED"} /> readings · location illustrative
        </div>
      </div>

      <div className="wc-label">
        Who uses it <em>· By purpose</em>
      </div>
      <div className="wc-card grid gap-1 p-3 font-mono text-[12px]">
        <div className="flex flex-wrap gap-1.5">
          {source.usedBy.map((u) => (
            <span key={u} className="rounded border border-line2 px-1.5 py-0.5 text-[11px]">
              {USE_LABEL[u]}
            </span>
          ))}
          {source.animalCapable && <span className="rounded border border-line2 px-1.5 py-0.5 text-[11px]">Animals OK</span>}
        </div>
        <p className="text-muted">
          {p.households} households · {p.animals.toLocaleString("en-IN")} animals · {p.farms} farms
        </p>
      </div>

      <div className="wc-label">
        Dispatch log <em>· Warnings sent</em>
      </div>
      <div className="wc-card grid gap-1.5 p-3 font-mono text-[11.5px] leading-snug">
        {st.tier === "safe" ? (
          <p className="text-muted">No warnings. Status: safe since {formatShort(st.since)}.</p>
        ) : (
          <>
            <div className="grid grid-cols-[52px_1fr] gap-2">
              <time className="text-faint">{formatShort(st.since)}</time>
              <span>
                {RISK_UI[st.tier].label} · SMS to {source.usedBy.includes("fetch") ? `${p.households} households` : ""}
                {source.usedBy.includes("spot") ? `${source.usedBy.includes("fetch") ? ", " : ""}herders` : ""}
                {source.usedBy.includes("pump") ? `${source.usedBy.length > 1 ? ", " : ""}${p.farms} farms` : ""}
              </span>
            </div>
            <div className="grid grid-cols-[52px_1fr] gap-2">
              <time className="text-faint">{formatShort(st.since)}</time>
              <span>Summary to Panchayat, {region.label}</span>
            </div>
            <div className="mt-1">
              <DataBadge provenance="SIMULATED" title="Delivery log is simulated in the demo" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
