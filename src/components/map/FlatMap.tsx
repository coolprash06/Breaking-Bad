"use client";

/**
 * Flat map of Thar + Kutch, drawn only from the Survey of India boundary (SVG + d3-geo).
 *
 * Performance: pan / zoom never re-renders React. The view lives in a ref and is
 * written straight to the DOM (one transform + one CSS variable) once per frame.
 * Markers and labels keep their size through `scale(var(--inv))`. React only
 * re-renders the marker layer when the zoom crosses a clustering step.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { geoGraticule, geoMercator, geoPath } from "d3-geo";
import type { GeoBundle } from "@/lib/geo/boundaries";
import { THAR_KUTCH_FRAME } from "@/lib/geo/boundaries";
import type { SourceView } from "@/lib/view";
import { RISK_UI, RiskShape, shortConfidence } from "./RiskMarker";
import { clusterMarkers, SEVERITY } from "./cluster";
import type { GwraBlockView, WellView } from "@/lib/real/view";
import { BlockLayer, LakeLayer, WellLayer } from "./RealLayers";
import { overlaps, type Box, type OccupiedLayout } from "./boxes";

/** REAL reference layers the map can show under the risk markers. */
export interface MapOverlays {
  blocks: GwraBlockView[] | null;
  wells: WellView[] | null;
  selectedWell: string | null;
  onWell(code: string): void;
  lakes: { id: string; name: string; lat: number; lon: number; latestHa: number | null }[] | null;
  selectedLake: string | null;
  onLake(id: string): void;
}

export interface ZoomApi {
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
}
export interface MapApi extends ZoomApi {
  /** Smoothly centre on a source (or the whole region when null). `intro` starts zoomed out, for the globe hand-off. */
  flyTo(id: string | null, opts?: { intro?: boolean; pairId?: string }): void;
}

/** Dashed route from an at-risk source to its suggested alternative. */
export interface MapLink {
  fromId: string;
  toId: string;
  km: number;
}

interface Props {
  geo: GeoBundle;
  sources: SourceView[];
  selectedId: string | null;
  onSelect(id: string): void;
  isRelevant(s: SourceView): boolean;
  apiRef: RefObject<MapApi | null>;
  link: MapLink | null;
  overlays?: MapOverlays;
}

interface View {
  k: number;
  cx: number; // view centre, in projected (k = 1) pixels
  cy: number;
}

const MIN_K = 1;
const MAX_K = 24;
const FOCUS_K = 4;
const CLUSTER_PX = 24; // markers closer than this on screen are clustered
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Zoom steps used to decide when to re-cluster (about every 26% of zoom). */
const bucketOf = (k: number) => Math.round(Math.log2(k) * 3);

export default function FlatMap({ geo, sources, selectedId, onSelect, isRelevant, apiRef, link, overlays }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const scaleBarRef = useRef<SVGPathElement>(null);
  const scaleTextRef = useRef<SVGTextElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [bucket, setBucket] = useState(0);
  const view = useRef<View>({ k: 1, cx: 0, cy: 0 });
  const anim = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Projection and static paths: recomputed only on resize. */
  const base = useMemo(() => {
    const { w, h } = size;
    if (!w || !h) return null;
    const narrow = w < 560;
    const proj = geoMercator().fitExtent(
      [
        [narrow ? 12 : 36, narrow ? 52 : 48],
        [w - (narrow ? 12 : 140), h - 40],
      ],
      { type: "MultiPoint", coordinates: THAR_KUTCH_FRAME },
    );
    const path = geoPath(proj);
    const at = (lon: number, lat: number) => proj([lon, lat]) as [number, number];
    const [x0, y1] = at(THAR_KUTCH_FRAME[0][0], THAR_KUTCH_FRAME[0][1]);
    const [x1, y0] = at(THAR_KUTCH_FRAME[1][0], THAR_KUTCH_FRAME[1][1]);
    const kmPx = at(70, 25)[0] - at(70 + 1 / (111.32 * Math.cos((25 * Math.PI) / 180)), 25)[0];
    return {
      at,
      bounds: { x0, x1, y0, y1 },
      home: { k: 1, cx: w / 2, cy: h / 2 } as View,
      pxPerKm: Math.abs(kmPx),
      graticule: path(geoGraticule().step([2, 2])()) ?? "",
      land: path(geo.land) ?? "",
      india: path(geo.india) ?? "",
      states: path(geo.stateLines) ?? "",
    };
  }, [size, geo]);

  const altId = link?.toId ?? null;
  const layout = useMemo(
    () => (base ? layoutSources({ at: base.at, sources, selectedId, altId, isRelevant, bucket }) : null),
    [base, sources, selectedId, altId, isRelevant, bucket],
  );

  const clamp = useCallback(
    (v: View): View => {
      if (!base) return v;
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k));
      // Keep the view centre inside Thar + Kutch.
      const { x0, x1, y0, y1 } = base.bounds;
      return { k, cx: Math.min(x1, Math.max(x0, v.cx)), cy: Math.min(y1, Math.max(y0, v.cy)) };
    },
    [base],
  );

  /** Write the view to the DOM. No React state, except a cluster step change. */
  const apply = useCallback(() => {
    frame.current = null;
    const g = worldRef.current;
    if (!g || !base) return;
    const { k, cx, cy } = view.current;
    g.setAttribute("transform", `translate(${size.w / 2 - cx * k} ${size.h / 2 - cy * k}) scale(${k})`);
    g.style.setProperty("--inv", String(1 / k));
    // Scale bar: pick a round distance that is 50-130 px long.
    const pxPerKm = base.pxPerKm * k;
    const km = [1, 2, 5, 10, 20, 50, 100].find((d) => d * pxPerKm >= 50) ?? 100;
    scaleBarRef.current?.setAttribute("d", `M0 -4V0H${(km * pxPerKm).toFixed(1)}V-4`);
    if (scaleTextRef.current) scaleTextRef.current.textContent = `${km} km`;
    const b = bucketOf(k);
    setBucket((old) => (old === b ? old : b));
  }, [base, size]);

  const schedule = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(apply);
  }, [apply]);

  const stopAnim = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  /** Smooth move: centre moves linearly, zoom moves in log space. */
  const animateTo = useCallback(
    (target: View, ms = 650, from?: View) => {
      stopAnim();
      const to = clamp(target);
      const a = from ?? { ...view.current };
      if (reducedMotion() || ms <= 0) {
        view.current = to;
        schedule();
        return;
      }
      const t0 = performance.now();
      const lk0 = Math.log(a.k);
      const lk1 = Math.log(to.k);
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = ease(t);
        view.current = { k: Math.exp(lk0 + (lk1 - lk0) * e), cx: a.cx + (to.cx - a.cx) * e, cy: a.cy + (to.cy - a.cy) * e };
        apply();
        anim.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [apply, clamp, schedule],
  );

  /** Zoom keeping the point under (px, py) fixed on screen. */
  const zoomAround = useCallback(
    (factor: number, px: number, py: number) => {
      stopAnim();
      const v = view.current;
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const wx = v.cx + (px - size.w / 2) / v.k;
      const wy = v.cy + (py - size.h / 2) / v.k;
      view.current = clamp({ k, cx: wx - (px - size.w / 2) / k, cy: wy - (py - size.h / 2) / k });
      schedule();
    },
    [clamp, schedule, size],
  );

  const sourcePos = useCallback(
    (id: string | null) => {
      const s = id ? sources.find((x) => x.id === id) : null;
      return s && base ? base.at(s.lon, s.lat) : null;
    },
    [sources, base],
  );

  /** Zoom that separates a source from its nearest neighbour by ~30 px (so it is not clustered). */
  const focusK = useCallback(
    (id: string) => {
      const p = sourcePos(id);
      if (!p || !base) return FOCUS_K;
      let d = Infinity;
      for (const s of sources) {
        if (s.id === id) continue;
        const q = base.at(s.lon, s.lat);
        d = Math.min(d, Math.hypot(q[0] - p[0], q[1] - p[1]));
      }
      return Math.min(MAX_K, Math.max(FOCUS_K, view.current.k, 30 / Math.max(d, 0.1)));
    },
    [sourcePos, sources, base],
  );

  // Initial view and re-fit on resize.
  useEffect(() => {
    if (!base) return;
    view.current = clamp({ ...view.current, cx: view.current.cx || base.home.cx, cy: view.current.cy || base.home.cy });
    schedule();
  }, [base, clamp, schedule]);

  useEffect(() => {
    apiRef.current = {
      zoomIn: () => {
        const p = sourcePos(selectedRef.current);
        const v = view.current;
        animateTo(p ? { k: v.k * 1.8, cx: p[0], cy: p[1] } : { ...v, k: v.k * 1.8 }, 350);
      },
      zoomOut: () => animateTo({ ...view.current, k: view.current.k / 1.8 }, 350),
      reset: () => base && animateTo(base.home, 600),
      flyTo: (id, opts) => {
        if (!base) return;
        const p = sourcePos(id);
        const q = sourcePos(opts?.pairId ?? null);
        let target: View = p && id ? { k: focusK(id), cx: p[0], cy: p[1] } : base.home;
        if (p && q) {
          // Frame both ends of the route in the middle ~55% of the view.
          const dx = Math.max(Math.abs(p[0] - q[0]), 1);
          const dy = Math.max(Math.abs(p[1] - q[1]), 1);
          const k = Math.min(MAX_K, Math.max(MIN_K, Math.min((size.w * 0.55) / dx, (size.h * 0.55) / dy)));
          target = { k, cx: (p[0] + q[0]) / 2, cy: (p[1] + q[1]) / 2 };
        }
        if (opts?.intro) {
          // Start zoomed out from the same centre so it continues the globe's fly-in.
          const t = clamp(target);
          animateTo(t, 900, { k: Math.max(MIN_K, t.k * 0.35), cx: t.cx, cy: t.cy });
        } else {
          animateTo(target, 700);
        }
      },
    };
  });

  // Wheel zoom toward the pointer (non-passive so the page does not scroll).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      zoomAround(Math.exp(-e.deltaY * 0.0018), e.clientX - b.left, e.clientY - b.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAround]);

  // Drag to pan, two fingers to pinch-zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; dist: number } | null>(null);
  const local = (e: React.PointerEvent) => {
    const b = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const gestureState = () => {
    const pts = [...pointers.current.values()];
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { x, y, dist };
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
      onPointerDown={(e) => {
        if ((e.target as Element).closest("[data-marker]")) return;
        stopAnim();
        pointers.current.set(e.pointerId, local(e));
        gesture.current = gestureState();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId) || !gesture.current) return;
        pointers.current.set(e.pointerId, local(e));
        const g = gestureState();
        const prev = gesture.current;
        const v = view.current;
        if (g.dist > 0 && prev.dist > 0) {
          // Pinch: zoom around the midpoint, then follow the midpoint.
          const factor = g.dist / prev.dist;
          const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
          const wx = v.cx + (prev.x - size.w / 2) / v.k;
          const wy = v.cy + (prev.y - size.h / 2) / v.k;
          view.current = clamp({ k, cx: wx - (g.x - size.w / 2) / k, cy: wy - (g.y - size.h / 2) / k });
        } else {
          view.current = clamp({ k: v.k, cx: v.cx - (g.x - prev.x) / v.k, cy: v.cy - (g.y - prev.y) / v.k });
        }
        gesture.current = g;
        schedule();
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        gesture.current = pointers.current.size ? gestureState() : null;
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        gesture.current = pointers.current.size ? gestureState() : null;
      }}
    >
      {base && (
        <svg className="wc-map absolute inset-0 h-full w-full" viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label="Map of Thar and Kutch with water source risk markers">
          <g ref={worldRef} style={{ ["--inv" as string]: 1 }}>
            <StaticLayer graticule={base.graticule} land={base.land} india={base.india} states={base.states} />
            <RegionLabels at={base.at} />
            {overlays?.blocks && layout && <BlockLayer at={base.at} blocks={overlays.blocks} layout={layout} />}
            {overlays?.wells && layout && (
              <WellLayer
                at={base.at}
                wells={overlays.wells}
                layout={layout}
                selectedCode={overlays.selectedWell}
                onWell={overlays.onWell}
              />
            )}
            {overlays?.lakes && layout && (
              <LakeLayer
                at={base.at}
                lakes={overlays.lakes}
                layout={layout}
                selectedId={overlays.selectedLake}
                onLake={overlays.onLake}
              />
            )}
            {link && <LinkLayer at={base.at} sources={sources} link={link} />}
            {layout && <MarkerLayer
              layout={layout}
              sources={sources}
              selectedId={selectedId}
              altId={link?.toId ?? null}
              isRelevant={isRelevant}
              onSelect={(id) => {
                onSelect(id);
                const p = sourcePos(id);
                if (p) animateTo({ k: focusK(id), cx: p[0], cy: p[1] }, 700);
              }}
              onCluster={(ids) => {
                // Expand: zoom until the cluster's markers are at least ~36 px apart.
                const pts = ids.map((id) => sourcePos(id)!).filter(Boolean);
                const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
                const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
                let minD = Infinity;
                for (let i = 0; i < pts.length; i++)
                  for (let j = i + 1; j < pts.length; j++) minD = Math.min(minD, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
                const k = Math.max(view.current.k * 1.8, 36 / Math.max(minD, 0.5));
                animateTo({ k, cx, cy }, 650);
              }}
            />}
          </g>
          <g pointerEvents="none" transform={`translate(16 ${size.h - 40})`}>
            <path ref={scaleBarRef} fill="none" stroke="var(--text)" strokeWidth={1.4} />
            <text ref={scaleTextRef} className="glab" x={0} y={-8} />
          </g>
        </svg>
      )}
    </div>
  );
}

/** Boundaries never change with pan / zoom (the parent transform scales them). */
const StaticLayer = memo(function StaticLayer(p: { graticule: string; land: string; india: string; states: string }) {
  return (
    <>
      <path className="graticule" d={p.graticule} vectorEffect="non-scaling-stroke" />
      <path className="land" d={p.land} />
      <path className="india" d={p.india} />
      <path className="state" d={p.states} vectorEffect="non-scaling-stroke" />
      <path className="india-glow" d={p.india} vectorEffect="non-scaling-stroke" />
      <path className="india-line" d={p.india} vectorEffect="non-scaling-stroke" />
    </>
  );
});

type At = (lon: number, lat: number) => [number, number];
const keepSize = (x: number, y: number) => ({ transform: `translate(${x}px, ${y}px) scale(var(--inv))` });

function LinkLayer({ at, sources, link }: { at: At; sources: SourceView[]; link: MapLink }) {
  const a = sources.find((s) => s.id === link.fromId);
  const b = sources.find((s) => s.id === link.toId);
  if (!a || !b) return null;
  const [x1, y1] = at(a.lon, a.lat);
  const [x2, y2] = at(b.lon, b.lat);
  const label = link.km < 1 ? `${link.km.toFixed(1)} km` : `${Math.round(link.km)} km`;
  const w = label.length * 6.6 + 10;
  return (
    <g pointerEvents="none" aria-hidden>
      <line className="alt-link-glow" x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      <line className="alt-link" x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      <g style={keepSize((x1 + x2) / 2, (y1 + y2) / 2)}>
        <rect x={-w / 2} y={-9} width={w} height={18} rx={9} fill="var(--panel)" stroke="var(--lab)" strokeWidth={1} />
        <text className="alt-km" textAnchor="middle" y={3.5}>
          {label}
        </text>
      </g>
    </g>
  );
}

const RegionLabels = memo(function RegionLabels({ at }: { at: At }) {
  const items = [
    [70.6, 27.6, "THAR", "reg"],
    [69.9, 24.05, "KUTCH", "reg"],
    [73.6, 29.6, "RAJASTHAN", "place"],
    [72.0, 22.45, "GUJARAT", "place"],
  ] as const;
  return (
    <g pointerEvents="none">
      {items.map(([lon, lat, t, cls]) => {
        const [x, y] = at(lon, lat);
        return (
          <text key={t} className={cls} style={keepSize(x, y)} textAnchor="middle">
            {t}
          </text>
        );
      })}
    </g>
  );
});

interface Placed {
  kind: "one" | "cluster";
  ids: string[];
  x: number; // projected (k = 1) px
  y: number;
  lead: SourceView; // most severe member
}

export interface SourceLayout extends OccupiedLayout {
  /** Representative zoom of this cluster step. */
  k: number;
  placed: Placed[];
  labels: { id: string; x: number; y: number; dx: number; dy: number; anchor: "start" | "end" | "middle"; name: string; sub: string }[];
}

/** Clusters and labels for the source markers at one zoom step (shared with the REAL layers). */
function layoutSources(args: {
  at: At;
  sources: SourceView[];
  selectedId: string | null;
  altId: string | null;
  isRelevant(s: SourceView): boolean;
  bucket: number;
}): SourceLayout {
  const { at, sources, selectedId, altId, isRelevant, bucket } = args;
  const k = Math.pow(2, bucket / 3); // representative zoom for this step
  const r = CLUSTER_PX / k; // cluster radius in projected px
  const pos = new Map(sources.map((s) => [s.id, at(s.lon, s.lat)]));
  const order = [...sources].sort(
    (a, b) =>
      Number(b.id === selectedId) - Number(a.id === selectedId) ||
      Number(b.id === altId) - Number(a.id === altId) ||
      Number(isRelevant(b)) - Number(isRelevant(a)) ||
      SEVERITY[a.status.tier] - SEVERITY[b.status.tier],
  );
  // The selected source seeds first; the cluster icon is always its most urgent member.
  const byId = new Map(sources.map((s) => [s.id, s]));
  const groups = clusterMarkers(
    order.map((s) => ({ id: s.id, x: pos.get(s.id)![0], y: pos.get(s.id)![1], tier: s.status.tier })),
    r,
  );
  const placed: Placed[] = groups.map((g) => ({
    kind: g.ids.length === 1 ? "one" : "cluster",
    ids: g.ids,
    x: g.x,
    y: g.y,
    lead: byId.get(g.leadId)!,
  }));
  const has = (p: Placed, id: string | null) => !!id && p.ids.includes(id);

  // Labels: selected + alerting relevant singles. Try right, left, below; drop if
  // the box would cover another marker or label (screen px at this zoom step).
  const boxes: Box[] = placed.map((p) => ({
    x0: p.x * k - (p.kind === "cluster" ? 18 : 13),
    y0: p.y * k - 13,
    x1: p.x * k + (p.kind === "cluster" ? 24 : 13),
    y1: p.y * k + 13,
  }));
  const labels: SourceLayout["labels"] = [];
  const want = placed.filter(
    (p) => has(p, selectedId) || has(p, altId) || (p.kind === "one" && isRelevant(p.lead) && p.lead.status.tier !== "safe"),
  );
  const rank = (p: Placed) => (has(p, selectedId) ? 2 : has(p, altId) ? 1 : 0);
  want.sort((a, b) => rank(b) - rank(a));
  for (const p of want) {
    const name = p.lead.name;
    const sub = p.kind === "cluster" ? `${shortConfidence(p.lead.status)} · +${p.ids.length - 1} nearby` : shortConfidence(p.lead.status);
    const w = Math.max(name.length * 6.6, sub.length * 6.1) + 4;
    const sx = p.x * k;
    const sy = p.y * k;
    const pad = p.kind === "cluster" ? 22 : 15;
    const options = [
      { dx: pad, dy: -2, anchor: "start" as const, box: { x0: sx + 13, y0: sy - 14, x1: sx + 15 + w, y1: sy + 14 } },
      { dx: -pad, dy: -2, anchor: "end" as const, box: { x0: sx - pad - w, y0: sy - 14, x1: sx - 13, y1: sy + 14 } },
      { dx: 0, dy: 26, anchor: "middle" as const, box: { x0: sx - w / 2, y0: sy + 14, x1: sx + w / 2, y1: sy + 40 } },
    ];
    const hit = (b: Box) => boxes.some((o) => overlaps(b, o));
    const ok = options.find((o) => !hit(o.box)) ?? (rank(p) > 0 ? options[0] : null);
    if (!ok) continue;
    boxes.push(ok.box);
    labels.push({ id: p.lead.id, x: p.x, y: p.y, dx: ok.dx, dy: ok.dy, anchor: ok.anchor, name, sub });
  }
  return { k, placed, labels, occupied: boxes, points: placed.map((p) => ({ x: p.x, y: p.y })) };
}

interface LayerProps {
  layout: SourceLayout;
  sources: SourceView[];
  selectedId: string | null;
  /** Suggested alternative: always its own marker, ringed and labelled. */
  altId: string | null;
  isRelevant(s: SourceView): boolean;
  onSelect(id: string): void;
  onCluster(ids: string[]): void;
}

/** Re-renders only when the data, selection, tab or cluster step changes. */
const MarkerLayer = memo(function MarkerLayer({ layout, sources, selectedId, altId, isRelevant, onSelect, onCluster }: LayerProps) {
  return (
    <g>
      {layout.placed.map((p) => {
        const s = p.lead;
        if (p.kind === "cluster") {
          const rel = p.ids.some((id) => isRelevant(sources.find((x) => x.id === id)!));
          const sel = p.ids.includes(selectedId ?? "");
          const hasAlt = !sel && p.ids.includes(altId ?? "");
          return (
            <g
              key={`c-${p.ids.join("-")}`}
              data-marker
              style={keepSize(p.x, p.y)}
              opacity={rel ? 1 : 0.35}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${p.ids.length} sources here, most urgent ${s.name} (${RISK_UI[s.status.tier].label}). Zoom in to separate them.`}
              onClick={() => onCluster(p.ids)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onCluster(p.ids)}
            >
              {sel && (
                <>
                  <rect x={-18} y={-16} width={42} height={32} rx={16} fill="none" stroke="var(--lab-glow)" strokeWidth={5} />
                  <rect x={-17} y={-15} width={40} height={30} rx={15} fill="none" stroke="var(--lab)" strokeWidth={1.6} />
                </>
              )}
              {hasAlt && <rect x={-17} y={-15} width={40} height={30} rx={15} fill="none" stroke="var(--lab)" strokeWidth={1.6} strokeDasharray="4 3" />}
              <rect x={-13} y={-11} width={32} height={22} rx={11} fill="var(--panel)" stroke={RISK_UI[s.status.tier].color} strokeWidth={1.3} strokeDasharray="3 2" />
              <RiskShape tier={s.status.tier} confidence={1} size={6} />
              <text x={12} y={4} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10.5} fontWeight={700} fill="var(--text)">
                {p.ids.length}
              </text>
              <title>{`${p.ids.length} sources: ${p.ids.map((id) => sources.find((x) => x.id === id)!.name).join(", ")}. Click to zoom in.`}</title>
            </g>
          );
        }
        const sel = s.id === selectedId;
        const isAlt = s.id === altId;
        return (
          <g
            key={s.id}
            data-marker
            style={keepSize(p.x, p.y)}
            opacity={isRelevant(s) || sel || isAlt ? 1 : 0.3}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={`${s.name}: ${s.status.summary}`}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.id)}
          >
            {sel && (
              <>
                <circle r={17} fill="none" stroke="var(--lab-glow)" strokeWidth={5} />
                <circle r={17} fill="none" stroke="var(--lab)" strokeWidth={1.6} />
              </>
            )}
            {isAlt && (
              <>
                <circle r={18} fill="none" stroke="var(--lab-glow)" strokeWidth={5} />
                <circle r={18} fill="none" stroke="var(--lab)" strokeWidth={1.6} strokeDasharray="4 3" />
              </>
            )}
            <circle r={13} fill="transparent" />
            <RiskShape tier={s.status.tier} confidence={s.status.confidence} size={8} />
            <title>{`${s.name}: ${s.status.summary}`}</title>
          </g>
        );
      })}
      <g pointerEvents="none">
        {layout.labels.map((l) => (
          <g key={l.id} style={keepSize(l.x, l.y)} textAnchor={l.anchor}>
            <text className="mk-l" x={l.dx} y={l.dy}>
              {l.name}
            </text>
            <text className="mk-c" x={l.dx} y={l.dy + 12}>
              {l.sub}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
});
