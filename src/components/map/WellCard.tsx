"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WellView } from "@/lib/real/view";
import DataBadge from "@/components/common/DataBadge";

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** History of one REAL CGWB observation well: depth to water (deeper = lower on the chart). */
export default function WellCard({ well, sourceName, onClose }: { well: WellView; sourceName: string | null; onClose(): void }) {
  const rows = well.readings.map((r) => ({ t: Date.parse(`${r.date}T00:00:00Z`), date: r.date, depth: r.depthM }));
  const last = well.readings[well.readings.length - 1];
  const tick = { fontSize: 9, fill: "var(--muted)", fontFamily: "var(--font-mono)" };
  const trend = well.preMonsoonTrendMPerYr;
  return (
    <div className="wc-ctl grid w-[min(330px,calc(100vw-32px))] gap-1.5 p-3 font-mono text-[11px]" role="dialog" aria-label={`CGWB well ${well.name}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="wc-label">
            Real reference well <em>· CGWB</em>
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-[var(--text)]">{well.name}</div>
          <div className="text-muted">
            {well.wellType ?? "Well"}
            {well.wellDepthM ? ` · ${well.wellDepthM} m deep` : ""} · {well.code}
          </div>
        </div>
        <button className="px-1.5 text-muted hover:text-lab" onClick={onClose} aria-label="Close well history">
          ✕
        </button>
      </div>
      <div className="text-[11.5px] text-[var(--text)]">Depth to water, m below ground</div>
      <div className="h-[120px] w-full" role="img" aria-label={`Depth to water at ${well.name}, ${rows.length} measurements`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--line)" strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tick={tick}
              stroke="var(--line)"
              tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
              minTickGap={28}
            />
            <YAxis reversed tick={tick} stroke="var(--line)" domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip
              contentStyle={{ background: "var(--panel)", border: "1px solid var(--line2)", fontFamily: "var(--font-mono)", fontSize: 11 }}
              labelFormatter={(t) => fmtDate(new Date(Number(t)).toISOString().slice(0, 10))}
              formatter={(v) => [`${Number(v).toFixed(2)} m below ground`, "Water"]}
            />
            <Line
              dataKey="depth"
              stroke="var(--text)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--text)", stroke: "var(--panel)", strokeWidth: 1 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted">Latest</dt>
        <dd className="text-right">
          {last ? `${last.depthM.toFixed(2)} m · ${fmtDate(last.date)}` : "none"}
        </dd>
        <dt className="text-muted">Pre-monsoon trend</dt>
        <dd className="text-right">
          {trend === null ? "too few readings" : trend > 0 ? `falling ${trend.toFixed(2)} m/yr` : `rising ${Math.abs(trend).toFixed(2)} m/yr`}
        </dd>
        {sourceName && (
          <>
            <dt className="text-muted">Near</dt>
            <dd className="text-right">
              {sourceName} · {well.nearestKm} km
            </dd>
          </>
        )}
      </dl>
      <div className="flex items-center gap-1.5 text-[10px] leading-snug text-muted">
        <DataBadge provenance="REAL" /> CGWB / India-WRIS via India Data Portal. Measured ~4 times a year.
      </div>
    </div>
  );
}
