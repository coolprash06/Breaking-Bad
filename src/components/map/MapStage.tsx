"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { loadBoundaries, type GeoBundle } from "@/lib/geo/boundaries";
import type { SourceView } from "@/lib/view";
import FlatMap, { type MapApi, type MapLink } from "./FlatMap";
import { THAR_KUTCH_FRAME } from "@/lib/geo/boundaries";
import type { GlobeApi } from "./Globe";
import { RISK_ORDER, RISK_UI, RiskIcon } from "./RiskMarker";
import { useThemeKey } from "@/components/theme/useThemeKey";
import type { RealView } from "@/lib/real/view";
import { GW_CATEGORY_UI } from "@/lib/real/view";
import type { GwCategory } from "@/lib/real/types";
import { BlockGlyph, LakeGlyph, WellGlyph } from "./RealLayers";
import WellCard from "./WellCard";
import LakeCard from "./LakeCard";

const GW_LEGEND: GwCategory[] = ["safe", "semi_critical", "critical", "over_exploited", "saline"];

const Globe = dynamic(() => import("./Globe"), {
  ssr: false,
  loading: () => <Calibrating text="Loading globe…" />,
});

type View = "globe" | "map";

function Calibrating({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <p className="font-mono text-xs tracking-[0.14em] text-muted">{text}</p>
    </div>
  );
}

/** Catches any 3D failure and hands over to the 2D map. */
class GlobeBoundary extends Component<{ onError(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Decide once whether this device should try the 3D globe at all. */
let capable: boolean | null = null;
function canRun3D(): boolean {
  if (capable === null) capable = probe3D();
  return capable;
}
const noSubscribe = () => () => {};
const WIDE_QUERY = "(min-width: 1280px)";
const isWide = () => window.matchMedia(WIDE_QUERY).matches;
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function probe3D(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.hardwareConcurrency ?? 4) <= 2 || (nav.deviceMemory ?? 4) <= 1) return false;
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

interface Props {
  sources: SourceView[];
  selectedId: string | null;
  onSelect(id: string): void;
  isRelevant(s: SourceView): boolean;
  /** Fly to this source (persona panel, readout links). `n` changes on every request. */
  focus: { id: string; n: number; pairId?: string } | null;
  /** Route from an at-risk source to its suggested alternative. */
  link: MapLink | null;
  /** REAL reference layers (CGWB blocks and observation wells). */
  real?: RealView | null;
}

const REGION_CENTRE = {
  lat: (THAR_KUTCH_FRAME[0][1] + THAR_KUTCH_FRAME[1][1]) / 2,
  lon: (THAR_KUTCH_FRAME[0][0] + THAR_KUTCH_FRAME[1][0]) / 2,
};
/** Roughly India's box: zooming through the globe here hands off to the map. */
const nearIndia = (lat: number, lon: number) => lat > 4 && lat < 38 && lon > 66 && lon < 99;

export default function MapStage({ sources, selectedId, onSelect, isRelevant, focus, link, real }: Props) {
  const [layers, setLayers] = useState({ blocks: false, wells: false, lakes: false });
  const [lakeId, setLakeId] = useState<string | null>(null);
  /** User's explicit legend choice; until then, open on wide screens, closed on smaller ones. */
  const [legendChoice, setLegendChoice] = useState<boolean | null>(null);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  const legendOpen = legendChoice ?? wide;
  const [wellCode, setWellCode] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoBundle | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [chosenView, setView] = useState<View>("globe");
  const [failure, setFailure] = useState<string | null>(null);
  // null during server render; the device check runs once in the browser.
  const capableHere = useSyncExternalStore(noSubscribe, canRun3D, () => null);
  const globeOk = capableHere === null ? null : capableHere && failure === null;
  const view: View = globeOk === false ? "map" : chosenView;
  const fallbackNote =
    capableHere === false ? "3D globe off on this device: showing the 2D map" : failure ? `${failure}: switched to the 2D map` : null;
  const globeApi = useRef<GlobeApi | null>(null);
  const mapApi = useRef<MapApi | null>(null);
  const flying = useRef(false);
  const themeKey = useThemeKey();

  useEffect(() => {
    loadBoundaries().then(setGeo, (e: Error) => setGeoError(e.message));
  }, []);

  const fallBack = useCallback((reason: string) => {
    setFailure((f) => f ?? reason);
    setView("map");
  }, []);

  const viewRef = useRef<View>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const sourcesRef = useRef(sources);
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  /**
   * One continuous move: the globe flies toward the target and, part-way in,
   * the map fades in already zooming toward the same spot.
   */
  const handOff = useCallback((sourceId: string | null, pairId?: string) => {
    const s = sourceId ? sourcesRef.current.find((x) => x.id === sourceId) : null;
    if (viewRef.current === "map" || !globeApi.current) {
      setView("map");
      mapApi.current?.flyTo(sourceId, { pairId });
      return;
    }
    if (flying.current) return;
    flying.current = true;
    const target = s ? { lat: s.lat, lon: s.lon } : REGION_CENTRE;
    globeApi.current.flyTo(target.lat, target.lon, () => {
      flying.current = false;
      setView("map");
      mapApi.current?.flyTo(sourceId, { intro: true, pairId });
    });
  }, []);

  const flyIn = useCallback(() => handOff(null), [handOff]);
  const onGlobeSource = useCallback(
    (id: string) => {
      onSelect(id);
      handOff(id);
    },
    [onSelect, handOff],
  );
  const onZoomThrough = useCallback(
    (lat: number, lon: number) => {
      if (nearIndia(lat, lon)) handOff(null);
    },
    [handOff],
  );

  // Focus requests from outside (persona panel, readout).
  useEffect(() => {
    if (focus) handOff(focus.id, focus.pairId);
  }, [focus, handOff]);

  const showGlobe = () => {
    if (!globeOk || view === "globe") return;
    setView("globe");
    globeApi.current?.flyOut(REGION_CENTRE.lat, REGION_CENTRE.lon);
    mapApi.current?.reset();
  };

  const markers = useMemo(
    () => sources.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, tier: s.status.tier })),
    [sources],
  );

  const api = () => (view === "globe" ? globeApi.current : mapApi.current);

  const lakeMarkers = useMemo(
    () =>
      real?.waterBodies?.list.map((l) => {
        const clear = l.series.filter((p) => p.areaHa !== null);
        return { id: l.id, name: l.name, lat: l.lat, lon: l.lon, latestHa: clear.length ? (clear[clear.length - 1].areaHa as number) : null };
      }) ?? [],
    [real],
  );
  const overlays = useMemo(
    () => ({
      blocks: layers.blocks ? (real?.gwra?.blocks ?? null) : null,
      wells: layers.wells ? (real?.wells?.list ?? null) : null,
      selectedWell: wellCode,
      onWell: (code: string) => {
        setWellCode(code);
        setLakeId(null);
      },
      lakes: layers.lakes ? lakeMarkers : null,
      selectedLake: lakeId,
      onLake: (id: string) => {
        setLakeId(id);
        setWellCode(null);
      },
    }),
    [layers, real, wellCode, lakeMarkers, lakeId],
  );
  const lake = layers.lakes && lakeId ? real?.waterBodies?.list.find((l) => l.id === lakeId) ?? null : null;
  const well = layers.wells && wellCode ? real?.wells?.list.find((w) => w.code === wellCode) ?? null : null;
  const toggleLayer = (k: "blocks" | "wells" | "lakes") => {
    setLayers((l) => ({ ...l, [k]: !l[k] }));
    if (k === "wells") setWellCode(null);
    if (k === "lakes") setLakeId(null);
    if (view === "globe") flyIn();
  };
  const unplaced = real?.gwra?.blocks.filter((b) => b.lat === null).map((b) => b.label) ?? [];

  return (
    <div
      className="relative h-full min-h-[440px] overflow-hidden"
      style={{ background: "radial-gradient(70% 70% at 50% 45%, color-mix(in srgb, var(--bg2) 40%, var(--sea)) 0%, var(--sea) 70%)" }}
    >
      {geoError && <Calibrating text={`Map data did not load (${geoError}). Refresh to try again.`} />}
      {!geo && !geoError && <Calibrating text="Calibrating boundaries…" />}

      {geo && globeOk && (
        <div className={`absolute inset-0 transition-opacity duration-[450ms] ${view === "globe" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <GlobeBoundary onError={() => fallBack("3D globe failed")}>
            <Globe
              geo={geo}
              markers={markers}
              apiRef={globeApi}
              themeKey={themeKey}
              onIndiaClick={flyIn}
              onSourceClick={onGlobeSource}
              onZoomThrough={onZoomThrough}
              onSlow={fallBack}
            />
          </GlobeBoundary>
        </div>
      )}
      {geo && (
        <div className={`absolute inset-0 transition-opacity duration-[450ms] ${view === "map" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <FlatMap
            geo={geo}
            sources={sources}
            selectedId={selectedId}
            onSelect={onSelect}
            isRelevant={isRelevant}
            apiRef={mapApi}
            link={link}
            overlays={overlays}
          />
        </div>
      )}

      {/* Control box: view switch (top-left) */}
      <div className="wc-ctl absolute top-3 left-3 z-10 flex items-center gap-0.5 p-[3px]" role="group" aria-label="Map view">
        {(["globe", "map"] as const).map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            disabled={v === "globe" && globeOk === false}
            title={v === "globe" && globeOk === false ? "3D globe is off on this device" : undefined}
            onClick={() => (v === "map" ? (view === "map" ? null : flyIn()) : showGlobe())}
            className={`rounded px-3 py-1.5 uppercase disabled:cursor-not-allowed disabled:opacity-40 ${
              view === v ? "text-lab shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--lab)_50%,transparent)]" : "text-muted"
            }`}
            style={view === v ? { background: "color-mix(in srgb, var(--lab) 16%, transparent)" } : undefined}
          >
            {v}
          </button>
        ))}
        <span className="ml-1 hidden border-l border-line2 py-0.5 pr-2 pl-2.5 font-mono text-[10px] tracking-[0.12em] text-faint sm:inline">
          SoI BOUNDARY
        </span>
      </div>

      {/* REAL reference layers (below the view switch) */}
      {real && (real.gwra || real.wells || real.waterBodies) && (
        <div className="wc-ctl absolute top-[52px] left-3 z-10 flex flex-wrap items-center gap-0.5 p-[3px]" role="group" aria-label="Real data layers">
          <span className="px-2 font-mono text-[10px] tracking-[0.12em] text-faint">REAL</span>
          {real.gwra && (
            <button
              aria-pressed={layers.blocks}
              onClick={() => toggleLayer("blocks")}
              title="CGWB Dynamic Ground Water Resources 2025: category of each assessment unit (block), shown at the block HQ town"
              className={`rounded px-2.5 py-1.5 uppercase ${layers.blocks ? "text-lab" : "text-muted"}`}
              style={layers.blocks ? { background: "color-mix(in srgb, var(--lab) 16%, transparent)" } : undefined}
            >
              CGWB blocks
            </button>
          )}
          {real.wells && (
            <button
              aria-pressed={layers.wells}
              onClick={() => toggleLayer("wells")}
              title="Real reference wells: CGWB observation wells with their measured depth to water"
              className={`rounded px-2.5 py-1.5 uppercase ${layers.wells ? "text-lab" : "text-muted"}`}
              style={layers.wells ? { background: "color-mix(in srgb, var(--lab) 16%, transparent)" } : undefined}
            >
              CGWB wells
            </button>
          )}
          {real.waterBodies && (
            <button
              aria-pressed={layers.lakes}
              onClick={() => toggleLayer("lakes")}
              title="Satellite-checked water bodies: open-water area of real, named lakes from Sentinel-2 over the past year"
              className={`rounded px-2.5 py-1.5 uppercase ${layers.lakes ? "text-lab" : "text-muted"}`}
              style={layers.lakes ? { background: "color-mix(in srgb, var(--lab) 16%, transparent)" } : undefined}
            >
              Lakes · S2
            </button>
          )}
        </div>
      )}

      {/* Legend (top-right): collapsible, collapsed by default on smaller screens */}
      <div className="absolute top-3 right-3 z-10 grid max-w-[220px] justify-items-end gap-2">
        <button
          className="wc-ctl px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase hover:text-lab"
          aria-expanded={legendOpen}
          aria-controls="map-legend"
          onClick={() => setLegendChoice(!legendOpen)}
        >
          Legend {legendOpen ? "▴" : "▾"}
        </button>
      </div>
      <div id="map-legend" className={`absolute top-[46px] right-3 z-10 max-w-[220px] gap-2 ${legendOpen ? "grid" : "hidden"}`}>
        <div className="wc-ctl grid gap-1.5 px-2.5 py-2 font-mono text-[11px]" aria-label="Risk legend">
          {RISK_ORDER.map((t) => (
            <span key={t} className="flex items-center gap-2">
              <RiskIcon tier={t} size={14} />
              {RISK_UI[t].label}
            </span>
          ))}
        </div>
        {view === "map" && layers.blocks && real?.gwra && (
          <div className="wc-ctl grid gap-1.5 px-2.5 py-2 font-mono text-[11px]" aria-label="CGWB block category legend">
            <span className="text-[10px] tracking-[0.1em] text-faint">CGWB 2025 · BLOCK</span>
            {GW_LEGEND.map((c) => (
              <span key={c} className="flex items-center gap-2">
                <svg width={28} height={16} viewBox="-14 -8 28 16" aria-hidden>
                  <BlockGlyph category={c} size={0.95} />
                </svg>
                {GW_CATEGORY_UI[c].label}
              </span>
            ))}
            <span className="text-[10px] leading-snug text-faint">
              At block HQ town. Safe blocks are counted, not named.
              {unplaced.length > 0 && ` Not placed: ${unplaced.join(", ")}.`}
            </span>
          </div>
        )}
        {view === "map" && layers.wells && real?.wells && (
          <div className="wc-ctl flex items-center gap-2 px-2.5 py-2 font-mono text-[11px]">
            <svg width={22} height={22} viewBox="-14 -14 28 28" aria-hidden>
              <WellGlyph />
            </svg>
            CGWB observation well
          </div>
        )}
        {view === "map" && layers.lakes && real?.waterBodies && (
          <div className="wc-ctl flex items-center gap-2 px-2.5 py-2 font-mono text-[11px]">
            <svg width={30} height={22} viewBox="-15 -11 30 22" aria-hidden>
              <LakeGlyph />
            </svg>
            Satellite-checked water body
          </div>
        )}
      </div>

      {lake && real?.waterBodies && (
        <div className="absolute bottom-12 left-3 z-20">
          <LakeCard lake={lake} method={real.waterBodies.method} onClose={() => setLakeId(null)} />
        </div>
      )}
      {well && (
        <div className="absolute bottom-12 left-3 z-20">
          <WellCard well={well} sourceName={sources.find((s) => s.id === well.nearestSourceId)?.name ?? null} onClose={() => setWellCode(null)} />
        </div>
      )}

      {/* Zoom box (bottom-right) */}
      <div className="wc-ctl absolute right-3 bottom-3 z-10 grid" role="group" aria-label="Zoom">
        <button className="px-3.5 py-2 text-left hover:text-lab" onClick={() => api()?.zoomIn()}>
          + ZOOM IN
        </button>
        <button className="border-t border-border px-3.5 py-2 text-left hover:text-lab" onClick={() => api()?.zoomOut()}>
          − ZOOM OUT
        </button>
        <button className="border-t border-border px-3.5 py-2 text-left hover:text-lab" onClick={() => api()?.reset()}>
          RESET
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3.5 z-10 max-w-[55%] font-mono text-[10.5px] leading-snug tracking-[0.08em] text-muted">
        {fallbackNote ?? (view === "globe" ? "DRAG TO TURN · CLICK INDIA OR SCROLL IN TO FLY IN" : "")}
      </p>
    </div>
  );
}
