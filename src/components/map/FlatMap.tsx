"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { geoGraticule, geoMercator, geoPath } from "d3-geo";
import type { GeoBundle } from "@/lib/geo/boundaries";
import { THAR_KUTCH_FRAME } from "@/lib/geo/boundaries";
import type { SourceView } from "@/lib/view";
import { RiskShape, shortConfidence } from "./RiskMarker";

export interface ZoomApi {
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
}

interface Props {
  geo: GeoBundle;
  sources: SourceView[];
  selectedId: string | null;
  onSelect(id: string): void;
  isRelevant(s: SourceView): boolean;
  apiRef: RefObject<ZoomApi | null>;
}

interface View {
  k: number;
  x: number;
  y: number;
}
const MIN_K = 1;
const MAX_K = 8;

export default function FlatMap({ geo, sources, selectedId, onSelect, isRelevant, apiRef }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drawn = useMemo(() => {
    const { w, h } = size;
    if (!w || !h) return null;
    const narrow = w < 560;
    const proj = geoMercator().fitExtent(
      [
        [narrow ? 16 : 40, 56],
        [w - (narrow ? 16 : 150), h - 44],
      ],
      { type: "MultiPoint", coordinates: THAR_KUTCH_FRAME },
    );
    const path = geoPath(proj);
    const at = (lon: number, lat: number) => proj([lon, lat]) as [number, number];
    const km50 = 50 / (111.32 * Math.cos((22.5 * Math.PI) / 180));
    return {
      at,
      graticule: path(geoGraticule().step([2, 2])()) ?? "",
      land: path(geo.land) ?? "",
      india: path(geo.india) ?? "",
      states: path(geo.stateLines) ?? "",
      scale: [at(68.2, 22.5), at(68.2 + km50, 22.5)] as const,
    };
  }, [size, geo]);

  const clampView = (v: View): View => {
    const k = Math.min(MAX_K, Math.max(MIN_K, v.k));
    const { w, h } = size;
    // Keep at least a third of the map on screen.
    const x = Math.min(w * 0.66, Math.max(w * 0.33 - w * k, v.x));
    const y = Math.min(h * 0.66, Math.max(h * 0.33 - h * k, v.y));
    return { k, x, y };
  };
  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const f = k / v.k;
      return clampView({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f });
    });

  useEffect(() => {
    apiRef.current = {
      zoomIn: () => zoomAt(1.5, size.w / 2, size.h / 2),
      zoomOut: () => zoomAt(1 / 1.5, size.w / 2, size.h / 2),
      reset: () => setView({ k: 1, x: 0, y: 0 }),
    };
  });

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - b.left, e.clientY - b.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const labelled = new Set(
    sources.filter((s) => s.id === selectedId || (isRelevant(s) && s.status.tier !== "safe")).map((s) => s.id),
  );

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
      onPointerDown={(e) => {
        if ((e.target as Element).closest("[data-marker]")) return;
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        setView((v) => clampView({ k: v.k, x: d.vx + dx, y: d.vy + dy }));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      {drawn && (
        <svg
          className="wc-map absolute inset-0 h-full w-full"
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="img"
          aria-label="Map of Thar and Kutch with water source risk markers"
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <path className="graticule" d={drawn.graticule} vectorEffect="non-scaling-stroke" />
            <path className="land" d={drawn.land} />
            <path className="india" d={drawn.india} vectorEffect="non-scaling-stroke" />
            <path className="state" d={drawn.states} vectorEffect="non-scaling-stroke" />
          </g>
          {/* Labels and markers stay the same size at every zoom level. */}
          <g transform={`translate(${view.x} ${view.y})`}>
            {(
              [
                [70.6, 27.6, "THAR", "reg"],
                [69.9, 23.95, "KUTCH", "reg"],
                [73.2, 29.6, "RAJASTHAN", "place"],
                [71.9, 22.45, "GUJARAT", "place"],
              ] as const
            ).map(([lon, lat, t, cls]) => {
              const [x, y] = drawn.at(lon, lat);
              return (
                <text key={t} className={cls} x={x * view.k} y={y * view.k} textAnchor="middle">
                  {t}
                </text>
              );
            })}
            {[24, 26, 28, 30].map((la) => {
              const [x, y] = drawn.at(67.75, la);
              return (
                <text key={la} className="glab" x={x * view.k} y={y * view.k - 3}>
                  {la}°N
                </text>
              );
            })}
          </g>
          <g transform={`translate(${view.x} ${view.y})`}>
            {sources.map((s) => {
              const [x, y] = drawn.at(s.lon, s.lat);
              const rel = isRelevant(s);
              const sel = s.id === selectedId;
              return (
                <g
                  key={s.id}
                  data-marker
                  transform={`translate(${x * view.k} ${y * view.k})`}
                  opacity={rel || sel ? 1 : 0.3}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.name}: ${s.status.summary}`}
                  onClick={() => onSelect(s.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.id)}
                >
                  {sel && <circle r={18} fill="none" stroke="var(--lab)" strokeWidth={1.6} style={{ filter: "drop-shadow(0 0 5px var(--lab-glow))" }} />}
                  <circle r={14} fill="transparent" />
                  <RiskShape tier={s.status.tier} confidence={s.status.confidence} size={8} />
                  <title>{`${s.name}: ${s.status.summary}`}</title>
                </g>
              );
            })}
            {sources
              .filter((s) => labelled.has(s.id))
              .map((s, i) => {
                const [x, y] = drawn.at(s.lon, s.lat);
                const left = s.lon < 69.7;
                const dy = i % 2 === 0 ? 0 : 4;
                return (
                  <g key={s.id} pointerEvents="none" textAnchor={left ? "end" : "start"}>
                    <text className="mk-l" x={x * view.k + (left ? -15 : 15)} y={y * view.k - 2 + dy}>
                      {s.name}
                    </text>
                    <text className="mk-c" x={x * view.k + (left ? -15 : 15)} y={y * view.k + 10 + dy}>
                      {shortConfidence(s.status)}
                    </text>
                  </g>
                );
              })}
          </g>
          <g pointerEvents="none" transform={`translate(16 ${size.h - 44})`}>
            <path
              d={`M0 -4V0H${(drawn.scale[1][0] - drawn.scale[0][0]) * view.k}V-4`}
              fill="none"
              stroke="var(--text)"
              strokeWidth={1.4}
            />
            <text className="glab" x={0} y={-8}>
              50 km
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}
