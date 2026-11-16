"use client";

/**
 * REAL reference layers on the flat map (toggleable):
 *  - CGWB GWRA 2025 block categories, drawn at each block's HQ town (no block boundaries)
 *  - CGWB observation wells ("Real reference wells")
 * Both use shapes and a neutral sand ramp that never collide with the risk markers
 * (circle / triangle / diamond / octagon in the fixed risk colours).
 */
import { memo } from "react";
import type { GwCategory } from "@/lib/real/types";
import type { GwraBlockView, WellView } from "@/lib/real/view";
import { GW_CATEGORY_UI } from "@/lib/real/view";

type At = (lon: number, lat: number) => [number, number];
const keepSize = (x: number, y: number) => ({ transform: `translate(${x}px, ${y}px) scale(var(--inv))` });

/** Pressure ramp: one neutral hue, light (Safe) to solid (Over-exploited). Saline is dotted. */
export const GW_FILL: Record<GwCategory, number> = {
  safe: 0,
  semi_critical: 0.3,
  critical: 0.6,
  over_exploited: 0.95,
  saline: 0,
};

export function BlockGlyph({ category, size = 1 }: { category: GwCategory; size?: number }) {
  const short = GW_CATEGORY_UI[category].short;
  const w = (short.length > 2 ? 26 : 20) * size;
  const h = 14 * size;
  const fill = GW_FILL[category];
  return (
    <g>
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={2}
        fill="var(--text)"
        fillOpacity={fill}
        stroke="var(--text)"
        strokeOpacity={0.85}
        strokeWidth={1.1}
        strokeDasharray={category === "saline" ? "2 1.6" : undefined}
      />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill="var(--sea)" fillOpacity={fill === 0 ? 0.7 : 0} />
      <text
        y={3.4 * size}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={8.5 * size}
        fontWeight={700}
        fill={fill > 0.5 ? "var(--sea)" : "var(--text)"}
      >
        {short}
      </text>
    </g>
  );
}

export const BlockLayer = memo(function BlockLayer({ at, blocks }: { at: At; blocks: GwraBlockView[] }) {
  // Two units can share a town (e.g. Jaisalmer urban / rural): fan them out a little.
  const seen = new Map<string, number>();
  return (
    <g aria-label="CGWB 2025 block categories">
      {blocks.map((b) => {
        if (b.lat === null || b.lon === null) return null;
        const key = `${b.lat},${b.lon}`;
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        const [x, y] = at(b.lon, b.lat);
        const stage = b.stagePct !== null ? ` · stage of extraction ${b.stagePct}%` : "";
        const prev = b.previous ? ` (2024: ${GW_CATEGORY_UI[b.previous.category].label}, ${b.previous.stagePct}%)` : "";
        return (
          <g key={`${b.district}-${b.label}`} style={keepSize(x, y)} opacity={0.92}>
            <g transform={`translate(0 ${n * 16})`}>
              <BlockGlyph category={b.category} />
              <text className="blk-l" x={14} y={3.5}>
                {b.label}
              </text>
              <title>{`${b.label} block (CGWB GWRA 2025): ${GW_CATEGORY_UI[b.category].label}${stage}${prev}${b.salinityAffected ? " · salinity-affected" : ""}. Shown at the block HQ town.`}</title>
            </g>
          </g>
        );
      })}
    </g>
  );
});

export function WellGlyph({ selected = false }: { selected?: boolean }) {
  return (
    <g>
      {selected && <circle r={11} fill="none" stroke="var(--lab)" strokeWidth={1.6} />}
      <circle r={6.5} fill="var(--sea)" stroke="var(--text)" strokeWidth={1.3} />
      <path d="M-9 0H-3.5M3.5 0H9M0 -9V-3.5M0 3.5V9" stroke="var(--text)" strokeWidth={1.3} strokeLinecap="round" />
      <circle r={1.6} fill="var(--text)" />
    </g>
  );
}

export const WellLayer = memo(function WellLayer({
  at,
  wells,
  selectedCode,
  onWell,
}: {
  at: At;
  wells: WellView[];
  selectedCode: string | null;
  onWell(code: string): void;
}) {
  return (
    <g aria-label="Real reference wells (CGWB)">
      {wells.map((w) => {
        const [x, y] = at(w.lon, w.lat);
        const last = w.readings[w.readings.length - 1];
        return (
          <g
            key={w.code}
            data-marker
            style={keepSize(x, y)}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={`CGWB observation well ${w.name}: water ${last?.depthM} m below ground on ${last?.date}`}
            onClick={() => onWell(w.code)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onWell(w.code)}
          >
            <circle r={12} fill="transparent" />
            <WellGlyph selected={w.code === selectedCode} />
            <title>{`CGWB well ${w.name}: ${last?.depthM} m below ground (${last?.date}). Click for its history.`}</title>
          </g>
        );
      })}
    </g>
  );
});
