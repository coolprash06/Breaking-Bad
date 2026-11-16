"use client";

/**
 * REAL reference layers on the flat map (toggleable), drawn UNDER the risk markers:
 *  - CGWB GWRA 2025 block categories at each block's HQ town (no block boundaries).
 *    Low zoom: badges only. Names appear when zoomed in, only where they overlap
 *    no source marker, source label, badge or other name; otherwise on hover.
 *  - CGWB observation wells: a blue crosshair ring, nudged clear of source markers
 *    (with a short leader line to its true position).
 * Shapes and colours never collide with the risk markers (circle / triangle /
 * diamond / octagon in the fixed risk colours).
 */
import { memo, useMemo } from "react";
import type { GwCategory } from "@/lib/real/types";
import type { GwraBlockView, WellView } from "@/lib/real/view";
import { GW_CATEGORY_UI } from "@/lib/real/view";
import { overlaps, type Box, type OccupiedLayout } from "./boxes";

type At = (lon: number, lat: number) => [number, number];
const keepSize = (x: number, y: number) => ({ transform: `translate(${x}px, ${y}px) scale(var(--inv))` });

/** Zoom from which block names are drawn (when they fit). */
export const BLOCK_NAME_K = 3.5;
/** Minimum screen gap between a reference well and a source marker (px). */
const WELL_GAP_PX = 24;

/** Pressure ramp: one neutral hue, light (Safe) to solid (Over-exploited). Saline is dotted. */
export const GW_FILL: Record<GwCategory, number> = {
  safe: 0,
  semi_critical: 0.3,
  critical: 0.6,
  over_exploited: 0.95,
  saline: 0,
};

const badgeWidth = (c: GwCategory) => (GW_CATEGORY_UI[c].short.length > 2 ? 26 : 20);

export function BlockGlyph({ category, size = 1 }: { category: GwCategory; size?: number }) {
  const short = GW_CATEGORY_UI[category].short;
  const w = badgeWidth(category) * size;
  const h = 14 * size;
  const fill = GW_FILL[category];
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill="var(--sea)" fillOpacity={0.75} />
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

interface PlacedBlock {
  b: GwraBlockView;
  x: number; // projected
  y: number;
  /** Screen-px nudge for units sharing a town. */
  fan: number;
  /** Fixed label side, or null = hover only. */
  label: { dx: number; anchor: "start" | "end" } | null;
}

export const BlockLayer = memo(function BlockLayer({ at, blocks, layout }: { at: At; blocks: GwraBlockView[]; layout: OccupiedLayout }) {
  const placed = useMemo(() => {
    const k = layout.k;
    const seen = new Map<string, number>();
    const items: PlacedBlock[] = [];
    for (const b of blocks) {
      if (b.lat === null || b.lon === null) continue;
      const key = `${b.lat},${b.lon}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const [x, y] = at(b.lon, b.lat);
      items.push({ b, x, y, fan: n * 16, label: null });
    }
    if (k < BLOCK_NAME_K) return items;
    const badge = (p: PlacedBlock): Box => {
      const w = badgeWidth(p.b.category) / 2;
      return { x0: p.x * k - w, y0: p.y * k + p.fan - 7, x1: p.x * k + w, y1: p.y * k + p.fan + 7 };
    };
    const taken: Box[] = [...layout.occupied, ...items.map(badge)];
    for (const p of items) {
      const w = badgeWidth(p.b.category) / 2;
      const tw = p.b.label.length * 5.9 + 4;
      const sx = p.x * k;
      const sy = p.y * k + p.fan;
      const options = [
        { dx: w + 4, anchor: "start" as const, box: { x0: sx + w + 2, y0: sy - 7, x1: sx + w + 4 + tw, y1: sy + 7 } },
        { dx: -w - 4, anchor: "end" as const, box: { x0: sx - w - 4 - tw, y0: sy - 7, x1: sx - w - 2, y1: sy + 7 } },
      ];
      const ok = options.find((o) => !taken.some((t) => overlaps(o.box, t)));
      if (ok) {
        p.label = { dx: ok.dx, anchor: ok.anchor };
        taken.push(ok.box);
      }
    }
    return items;
  }, [at, blocks, layout]);

  return (
    <g aria-label="CGWB 2025 block categories">
      {placed.map(({ b, x, y, fan, label }) => {
        const w = badgeWidth(b.category) / 2;
        const stage = b.stagePct !== null ? ` · stage of extraction ${b.stagePct}%` : "";
        const prev = b.previous ? ` (2024: ${GW_CATEGORY_UI[b.previous.category].label}, ${b.previous.stagePct}%)` : "";
        const tw = b.label.length * 5.9 + 8;
        return (
          <g key={`${b.district}-${b.label}`} className="blk" style={keepSize(x, y)}>
            <g transform={`translate(0 ${fan})`}>
              <BlockGlyph category={b.category} />
              {label ? (
                <text className="blk-l" x={label.dx} y={3.5} textAnchor={label.anchor}>
                  {b.label}
                </text>
              ) : (
                <g className="blk-h" pointerEvents="none">
                  <rect x={w + 2} y={-8} width={tw} height={16} rx={3} fill="var(--panel)" stroke="var(--line2)" strokeWidth={1} />
                  <text className="blk-l" x={w + 6} y={3.5}>
                    {b.label}
                  </text>
                </g>
              )}
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
      {selected && <circle r={14} fill="none" stroke="var(--lab)" strokeWidth={1.8} />}
      {/* dark halo keeps it readable over land, boundaries and labels */}
      <circle r={8} fill="none" stroke="var(--sea)" strokeWidth={4.5} />
      <path d="M-12 0H-6M6 0H12M0 -12V-6M0 6V12" stroke="var(--sea)" strokeWidth={4.5} strokeLinecap="round" />
      <circle r={8} fill="color-mix(in srgb, var(--refwell) 18%, transparent)" stroke="var(--refwell)" strokeWidth={2.2} />
      <path d="M-12 0H-6M6 0H12M0 -12V-6M0 6V12" stroke="var(--refwell)" strokeWidth={2.2} strokeLinecap="round" />
      <circle r={2} fill="var(--refwell)" />
    </g>
  );
}

export const WellLayer = memo(function WellLayer({
  at,
  wells,
  layout,
  selectedCode,
  onWell,
}: {
  at: At;
  wells: WellView[];
  layout: OccupiedLayout;
  selectedCode: string | null;
  onWell(code: string): void;
}) {
  // Nudge each well clear of the nearest source marker (screen px at this zoom step).
  const placed = useMemo(() => {
    const k = layout.k;
    return wells.map((w) => {
      const [x, y] = at(w.lon, w.lat);
      let best: { d: number; ux: number; uy: number } | null = null;
      for (const p of layout.points) {
        const vx = (x - p.x) * k;
        const vy = (y - p.y) * k;
        const d = Math.hypot(vx, vy);
        if (!best || d < best.d) best = { d, ux: d > 0.01 ? vx / d : 0.71, uy: d > 0.01 ? vy / d : -0.71 };
      }
      let dx = 0;
      let dy = 0;
      if (best && best.d < WELL_GAP_PX) {
        const push = WELL_GAP_PX - best.d;
        dx = best.ux * push;
        dy = best.uy * push;
      }
      return { w, x, y, dx, dy };
    });
  }, [at, wells, layout]);

  return (
    <g aria-label="Real reference wells (CGWB)">
      {placed.map(({ w, x, y, dx, dy }) => {
        const last = w.readings[w.readings.length - 1];
        const moved = Math.hypot(dx, dy) > 0.5;
        return (
          <g key={w.code} style={keepSize(x, y)}>
            {moved && (
              <>
                <line x1={0} y1={0} x2={dx} y2={dy} stroke="var(--refwell)" strokeWidth={1.2} strokeDasharray="2 2" />
                <circle r={2} fill="var(--refwell)" />
              </>
            )}
            <g
              data-marker
              transform={`translate(${dx} ${dy})`}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`CGWB observation well ${w.name}: water ${last?.depthM} m below ground on ${last?.date}`}
              onClick={() => onWell(w.code)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onWell(w.code)}
            >
              <circle r={14} fill="transparent" />
              <WellGlyph selected={w.code === selectedCode} />
              <title>{`CGWB well ${w.name}: ${last?.depthM} m below ground (${last?.date}). Click for its history.`}</title>
            </g>
          </g>
        );
      })}
    </g>
  );
});

// ---------------------------------------------------------------- Satellite-checked water bodies

/** Blue lake glyph (ellipse + waves): not a risk shape, not the Safe teal-cyan. */
export function LakeGlyph({ selected = false }: { selected?: boolean }) {
  return (
    <g>
      {selected && <ellipse rx={17} ry={12} fill="none" stroke="var(--lab)" strokeWidth={1.8} />}
      <ellipse rx={12} ry={8} fill="none" stroke="var(--sea)" strokeWidth={4.5} />
      <ellipse rx={12} ry={8} fill="color-mix(in srgb, var(--water) 35%, transparent)" stroke="var(--water)" strokeWidth={2} />
      <path d="M-7 -1.5q1.75 -2 3.5 0t3.5 0t3.5 0t3.5 0M-5 3q1.75 -2 3.5 0t3.5 0t3.5 0" fill="none" stroke="var(--water)" strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

export const LakeLayer = memo(function LakeLayer({
  at,
  lakes,
  layout,
  selectedId,
  onLake,
}: {
  at: At;
  lakes: { id: string; name: string; lat: number; lon: number; latestHa: number | null }[];
  layout: OccupiedLayout;
  selectedId: string | null;
  onLake(id: string): void;
}) {
  const placed = useMemo(() => {
    const k = layout.k;
    const taken: Box[] = [...layout.occupied];
    return lakes.map((l) => {
      const [x, y] = at(l.lon, l.lat);
      // Nudge clear of the nearest source marker, as for the reference wells.
      let best: { d: number; ux: number; uy: number } | null = null;
      for (const p of layout.points) {
        const vx = (x - p.x) * k;
        const vy = (y - p.y) * k;
        const d = Math.hypot(vx, vy);
        if (!best || d < best.d) best = { d, ux: d > 0.01 ? vx / d : -0.71, uy: d > 0.01 ? vy / d : 0.71 };
      }
      let dx = 0;
      let dy = 0;
      if (best && best.d < WELL_GAP_PX + 4) {
        const push = WELL_GAP_PX + 4 - best.d;
        dx = best.ux * push;
        dy = best.uy * push;
      }
      const text = l.latestHa !== null ? `${l.name} · ${l.latestHa.toFixed(1)} ha` : l.name;
      const tw = text.length * 6.2 + 6;
      const sx = x * k + dx;
      const sy = y * k + dy;
      const options = [
        { dx: 16, anchor: "start" as const, box: { x0: sx + 14, y0: sy - 8, x1: sx + 16 + tw, y1: sy + 8 } },
        { dx: -16, anchor: "end" as const, box: { x0: sx - 16 - tw, y0: sy - 8, x1: sx - 14, y1: sy + 8 } },
      ];
      const ok = options.find((o) => !taken.some((t) => overlaps(o.box, t))) ?? null;
      if (ok) taken.push(ok.box);
      taken.push({ x0: sx - 13, y0: sy - 9, x1: sx + 13, y1: sy + 9 });
      return { l, x, y, dx, dy, text, label: ok ? { dx: ok.dx, anchor: ok.anchor } : null };
    });
  }, [at, lakes, layout]);

  return (
    <g aria-label="Satellite-checked water bodies (Sentinel-2)">
      {placed.map(({ l, x, y, dx, dy, text, label }) => {
        const moved = Math.hypot(dx, dy) > 0.5;
        return (
          <g key={l.id} className="blk" style={keepSize(x, y)}>
            {moved && (
              <>
                <line x1={0} y1={0} x2={dx} y2={dy} stroke="var(--water)" strokeWidth={1.2} strokeDasharray="2 2" />
                <circle r={2} fill="var(--water)" />
              </>
            )}
            <g
              data-marker
              transform={`translate(${dx} ${dy})`}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${l.name}: open-water area from Sentinel-2. Click for the chart.`}
              onClick={() => onLake(l.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onLake(l.id)}
            >
              <ellipse rx={15} ry={11} fill="transparent" />
              <LakeGlyph selected={l.id === selectedId} />
              {label ? (
                <text className="lake-l" x={label.dx} y={3.5} textAnchor={label.anchor}>
                  {text}
                </text>
              ) : (
                <g className="blk-h" pointerEvents="none">
                  <rect x={14} y={-8} width={text.length * 6.2 + 10} height={16} rx={3} fill="var(--panel)" stroke="var(--line2)" strokeWidth={1} />
                  <text className="lake-l" x={18} y={3.5}>
                    {text}
                  </text>
                </g>
              )}
              <title>{`${l.name}: water area measured from Sentinel-2. Click for the past year.`}</title>
            </g>
          </g>
        );
      })}
    </g>
  );
});
