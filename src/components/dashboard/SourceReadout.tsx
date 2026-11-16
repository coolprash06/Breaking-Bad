"use client";

import { useEffect, useState } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { sourceTypeLabel } from "@/config/sourceTypes";
import { DISTRICTS } from "@/config/regions";
import { formatShort } from "@/lib/time";
import type { Provenance } from "@/lib/types";
import type { SourceView } from "@/lib/view";
import DataBadge from "@/components/common/DataBadge";
import { RISK_UI, RiskIcon, RiskPill, shortConfidence } from "@/components/map/RiskMarker";
import { PERSONAS } from "@/config/personas";
import { formatKm } from "@/lib/alerts/nearest";
import type { DispatchMessage, FieldReply } from "@/lib/alerts/dispatch";
import type { RealView } from "@/lib/real/view";
import { GW_CATEGORY_UI } from "@/lib/real/view";

const fmtMonth = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** REAL context around a source: CGWB GWRA 2025 district figures, nearest block, nearest CGWB well, monsoon. */
function GroundwaterCard({ source, real }: { source: SourceView; real: RealView }) {
  const ctx = real.sources[source.id];
  const g = real.gwra;
  if (!ctx || !g) return null;
  const d = g.districts[ctx.gwDistrict];
  const stage = GW_CATEGORY_UI[d.stageCategory].label;
  const phalodi = source.district === "phalodi";
  const m = ctx.monsoon;
  const blocks = [
    d.counts.over_exploited ? `${d.counts.over_exploited} OE` : null,
    d.counts.critical ? `${d.counts.critical} C` : null,
    d.counts.semi_critical ? `${d.counts.semi_critical} SC` : null,
    d.counts.safe ? `${d.counts.safe} Safe` : null,
    d.counts.saline ? `${d.counts.saline} saline` : null,
  ].filter(Boolean);
  let note: string;
  if (!ctx.groundwaterFed) note = "Surface / rain-fed source: the regional aquifer decline does not apply to it.";
  else if (d.impliedDeclineMPerYr > 0)
    note = `This over-draft sets the background decline of this source: about ${(d.impliedDeclineMPerYr * 100).toFixed(1)} cm a year (gap / recharge area / specific yield ${g.specificYield}, our assumption).`;
  else note = "The district takes less than it recharges, so no regional decline is added to this source.";
  if (phalodi) note += " Phalodi is reported under Jodhpur in GWRA 2025.";
  if (d.salinityUnits.length > 0) note += ` Salinity-affected units in the district: ${d.salinityUnits.join(", ")}.`;
  return (
    <>
      <div className="wc-label">
        Groundwater context <em>· {d.name} district, real figures</em>
      </div>
      <div className="wc-card grid gap-2 p-3 font-mono text-[12px]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
          <dt className="text-muted">Stage of extraction</dt>
          <dd className="text-right">
            <span className="font-semibold">{d.stagePct.toFixed(1)}%</span> · {stage}
          </dd>
          <dt className="text-muted">Annual recharge</dt>
          <dd className="text-right">{Math.round(d.rechargeMcm)} million m³</dd>
          <dt className="text-muted">Annual extraction</dt>
          <dd className="text-right">{Math.round(d.extractionMcm)} million m³</dd>
          <dt className="text-muted">{d.gapMcm > 0 ? "Over-draft" : "Headroom"}</dt>
          <dd className="text-right">
            {Math.abs(Math.round(d.gapMcm))} million m³/yr {d.gapMcm > 0 ? "over" : "under"} the usable resource
          </dd>
          <dt className="text-muted">Blocks</dt>
          <dd className="text-right">
            {blocks.join(" · ")} of {d.unitsTotal}
          </dd>
          {ctx.block && (
            <>
              <dt className="text-muted">Nearest block HQ</dt>
              <dd className="text-right">
                {ctx.block.label} ({ctx.block.km} km) · {GW_CATEGORY_UI[ctx.block.category].label}
                {ctx.block.stagePct !== null ? ` · ${ctx.block.stagePct}%` : ""}
              </dd>
            </>
          )}
        </dl>
        <p className="text-[11px] leading-snug text-muted">{note}</p>
        {(m || ctx.refWell) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border pt-2 tabular-nums">
            {m && (
              <>
                <dt className="text-muted">Monsoon {m.year}</dt>
                <dd className="text-right">
                  {m.actualMm} mm · {m.departurePct >= 0 ? `+${m.departurePct}` : m.departurePct}% vs normal
                </dd>
              </>
            )}
            {ctx.refWell && (
              <>
                <dt className="text-muted">CGWB well</dt>
                <dd className="text-right">
                  {ctx.refWell.name} ({ctx.refWell.km} km): water {ctx.refWell.lastDepthM.toFixed(1)} m down, {fmtMonth(ctx.refWell.lastDate)}
                </dd>
              </>
            )}
          </dl>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] leading-snug text-muted">
          <DataBadge provenance="REAL" /> CGWB GWRA 2025 · ERA5 rain (normal = ERA5 1991-2020) · CGWB wells
        </div>
      </div>
    </>
  );
}

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

interface ReadoutProps {
  source: SourceView | null;
  asOf: string;
  /** Suggested alternative being shown on the map; this source's warning stays pinned. */
  alt: { source: SourceView; km: number } | null;
  onOpenAlt(): void;
  onClearAlt(): void;
  /** Warnings sent for this source, and replies from its users. */
  sent: DispatchMessage[];
  replies: FieldReply[];
  /** REAL reference context (CGWB, ERA5); null when not cached. */
  real?: RealView | null;
}

/** Pinned strip: the at-risk source stays selected while its alternative is shown on the map. */
function AltStrip({ alt, onOpenAlt, onClearAlt }: Pick<ReadoutProps, "onOpenAlt" | "onClearAlt"> & { alt: NonNullable<ReadoutProps["alt"]> }) {
  return (
    <div className="wc-card grid gap-2 p-3" style={{ borderColor: "var(--lab)" }}>
      <div className="wc-label">
        Route shown <em>· Suggested alternative</em>
      </div>
      <div className="flex items-center gap-2 font-mono text-[12.5px]">
        <RiskIcon tier={alt.source.status.tier} size={14} />
        <span className="font-semibold">{alt.source.name}</span>
        <span className="text-muted">
          {formatKm(alt.km)} away · {RISK_UI[alt.source.status.tier].label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button className="wc-btn" onClick={onOpenAlt}>
          Open {alt.source.name}
        </button>
        <button className="wc-btn" onClick={onClearAlt}>
          Hide route
        </button>
      </div>
    </div>
  );
}

export default function SourceReadout({ source, asOf, alt, onOpenAlt, onClearAlt, sent, replies, real }: ReadoutProps) {
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
      {alt && <AltStrip alt={alt} onOpenAlt={onOpenAlt} onClearAlt={onClearAlt} />}
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
          <DataBadge provenance={d?.provenance.readings ?? "SIMULATED"} /> level readings (no public daily data for village sources)
          {real?.climate && (
            <>
              {" · "}
              <DataBadge provenance="REAL" /> rain &amp; evaporation (ERA5)
            </>
          )}
          {" · location illustrative"}
        </div>
      </div>

      {real && <GroundwaterCard source={source} real={real} />}

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
        {sent.length === 0 && replies.length === 0 ? (
          <p className="text-muted">
            No warnings sent{st.tier === "safe" ? `. Status: safe since ${formatShort(st.since)}.` : " yet."}
          </p>
        ) : (
          <>
            {[...sent].reverse().map((m) => (
              <div key={m.id} className="grid grid-cols-[52px_1fr] gap-2">
                <time className="text-faint">{formatShort(m.date)}</time>
                <span>
                  {RISK_UI[m.tier].label} → {PERSONAS.find((p) => p.id === m.personaId)?.name}
                  <span className="text-muted">
                    {" "}
                    · {m.recipients.count.toLocaleString("en-IN")} {m.recipients.unit} · {m.lang === "hi" ? "Hindi" : "English"}
                  </span>
                </span>
              </div>
            ))}
            {replies.map((r) => (
              <div key={r.id} className="grid grid-cols-[52px_1fr] gap-2">
                <time className="text-faint">{formatShort(r.date)}</time>
                <span className="text-lab">
                  Field reply: {r.value === 1 ? "water low" : "still fine"}
                </span>
              </div>
            ))}
          </>
        )}
        <div className="mt-1">
          <DataBadge provenance="SIMULATED" title="Delivery is simulated in the demo" />
        </div>
      </div>
    </div>
  );
}
