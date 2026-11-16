"use client";

import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { WaterBody } from "@/lib/real/types";
import DataBadge from "@/components/common/DataBadge";

const fmt = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

interface Row {
  t: number;
  area?: number | null;
  haze?: number | null;
}

/** Small "x" for a reading flagged as dust / haze (not used). */
function HazeMark(props: { cx?: number; cy?: number; payload?: Row }) {
  const { cx, cy, payload } = props;
  if (payload?.haze == null || cx === undefined || cy === undefined || !Number.isFinite(cy)) return <g />;
  return (
    <path d={`M${cx - 3} ${cy - 3}L${cx + 3} ${cy + 3}M${cx + 3} ${cy - 3}L${cx - 3} ${cy + 3}`} stroke="var(--muted)" strokeWidth={1.5} strokeLinecap="round" />
  );
}

/** One REAL lake: open-water area from Sentinel-2 over the past year. */
export default function LakeCard({ lake, method, onClose }: { lake: WaterBody; method: string; onClose(): void }) {
  const rows: Row[] = lake.series
    .filter((p) => p.areaHa !== null || p.haze !== undefined)
    .map((p) => ({ t: Date.parse(`${p.date}T00:00:00Z`), area: p.areaHa, haze: p.haze ?? null }));
  const clear = lake.series.filter((p) => p.areaHa !== null);
  const cloudy = lake.series.filter((p) => p.cloudy).length;
  const hazy = lake.series.filter((p) => p.haze !== undefined).length;
  const first = clear[0];
  const last = clear[clear.length - 1];
  const max = clear.reduce((m, p) => Math.max(m, p.areaHa as number), 0);
  const change = first && last ? (100 * ((last.areaHa as number) - (first.areaHa as number))) / Math.max(0.01, first.areaHa as number) : null;
  const tick = { fontSize: 9, fill: "var(--muted)", fontFamily: "var(--font-mono)" };
  const lastCloudy = lake.series.length > 0 && lake.series[lake.series.length - 1].areaHa === null;
  const ddmm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
  return (
    <div className="wc-ctl grid w-[min(340px,calc(100vw-32px))] gap-1.5 p-3 font-mono text-[11px]" role="dialog" aria-label={`${lake.name} water area`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="wc-label">
            Satellite-checked <em>· Water body</em>
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-[var(--text)]">{lake.name}</div>
          <div className="text-muted">
            {lake.district}, {lake.state}
          </div>
        </div>
        <button className="px-1.5 text-muted hover:text-lab" onClick={onClose} aria-label="Close water body chart">
          ✕
        </button>
      </div>
      <div className="text-[11.5px] text-[var(--text)]">Open water, hectares (past year)</div>
      <div className="h-[120px] w-full" role="img" aria-label={`${lake.name} water area from ${clear.length} clear Sentinel-2 images`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--line)" strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tick={tick}
              stroke="var(--line)"
              tickFormatter={(t: number) => new Date(t).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
              minTickGap={26}
            />
            <YAxis tick={tick} stroke="var(--line)" domain={[0, "auto"]} tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip
              contentStyle={{ background: "var(--panel)", border: "1px solid var(--line2)", fontFamily: "var(--font-mono)", fontSize: 11 }}
              labelFormatter={(t) => fmt(Number(t))}
              formatter={(v, name) =>
                name === "haze" ? [`${Number(v).toFixed(1)} ha`, "Dust / haze: not used"] : [`${Number(v).toFixed(1)} ha`, "Open water"]
              }
            />
            <Line dataKey="area" stroke="var(--water)" strokeWidth={2} dot={{ r: 2, fill: "var(--water)", strokeWidth: 0 }} connectNulls isAnimationActive={false} />
            <Scatter dataKey="haze" name="haze" shape={HazeMark} isAnimationActive={false} legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted">Latest clear</dt>
        <dd className="text-right">
          {last ? `${(last.areaHa as number).toFixed(1)} ha · ${ddmm(last.date)}` : "none"}
          {lastCloudy && " (newest image cloudy)"}
        </dd>
        <dt className="text-muted">Year peak</dt>
        <dd className="text-right">{max.toFixed(1)} ha</dd>
        {change !== null && (
          <>
            <dt className="text-muted">Change in a year</dt>
            <dd className="text-right">{change >= 0 ? `+${change.toFixed(0)}` : change.toFixed(0)}%</dd>
          </>
        )}
        <dt className="text-muted">Images</dt>
        <dd className="text-right">
          {lake.series.length} · {cloudy} cloudy skipped{hazy ? ` · ${hazy} hazy ×` : ""}
        </dd>
      </dl>
      <p className="text-[10px] leading-snug text-muted" title={method}>
        NDWI &gt; 0 within {lake.radiusM >= 1000 ? `${(lake.radiusM / 1000).toFixed(1)} km` : `${lake.radiusM} m`} of the{" "}
        <a className="underline" href={lake.coordinateSource} target="_blank" rel="noreferrer">
          published coordinate
        </a>
        .
      </p>
      <div className="flex items-center gap-1.5 text-[10px] leading-snug text-muted">
        <DataBadge provenance="REAL" /> Copernicus Sentinel-2 data, via Microsoft Planetary Computer.
      </div>
    </div>
  );
}
