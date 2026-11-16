"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { loadBoundaries, type GeoBundle } from "@/lib/geo/boundaries";
import type { SourceView } from "@/lib/view";
import FlatMap, { type ZoomApi } from "./FlatMap";
import type { GlobeApi } from "./Globe";
import { RISK_ORDER, RISK_UI, RiskIcon } from "./RiskMarker";
import { useThemeKey } from "@/components/theme/useThemeKey";

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
}

export default function MapStage({ sources, selectedId, onSelect, isRelevant }: Props) {
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
  const mapApi = useRef<ZoomApi | null>(null);
  const flying = useRef(false);
  const themeKey = useThemeKey();

  useEffect(() => {
    loadBoundaries().then(setGeo, (e: Error) => setGeoError(e.message));
  }, []);

  const fallBack = useCallback((reason: string) => {
    setFailure((f) => f ?? reason);
    setView("map");
  }, []);

  const flyIn = useCallback(() => {
    if (flying.current) return;
    if (!globeApi.current) return setView("map");
    flying.current = true;
    globeApi.current.flyToRegion(() => {
      flying.current = false;
      setView("map");
    });
  }, []);

  const showGlobe = () => {
    if (!globeOk) return;
    setView("globe");
    mapApi.current?.reset();
    globeApi.current?.reset();
  };

  const markers = useMemo(
    () => sources.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, tier: s.status.tier })),
    [sources],
  );

  const api = () => (view === "globe" ? globeApi.current : mapApi.current);

  return (
    <div
      className="relative h-full min-h-[440px] overflow-hidden"
      style={{ background: "radial-gradient(70% 70% at 50% 45%, color-mix(in srgb, var(--bg2) 40%, var(--sea)) 0%, var(--sea) 70%)" }}
    >
      {geoError && <Calibrating text={`Map data did not load (${geoError}). Refresh to try again.`} />}
      {!geo && !geoError && <Calibrating text="Calibrating boundaries…" />}

      {geo && globeOk && (
        <div className={`absolute inset-0 transition-opacity duration-500 ${view === "globe" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <GlobeBoundary onError={() => fallBack("3D globe failed")}>
            <Globe geo={geo} markers={markers} apiRef={globeApi} themeKey={themeKey} onIndiaClick={flyIn} onSlow={fallBack} />
          </GlobeBoundary>
        </div>
      )}
      {geo && (
        <div className={`absolute inset-0 transition-opacity duration-500 ${view === "map" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <FlatMap geo={geo} sources={sources} selectedId={selectedId} onSelect={onSelect} isRelevant={isRelevant} apiRef={mapApi} />
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

      {/* Legend (top-right) */}
      <div className="wc-ctl absolute top-3 right-3 z-10 hidden gap-1.5 px-2.5 py-2 font-mono text-[11px] sm:grid" aria-label="Risk legend">
        {RISK_ORDER.map((t) => (
          <span key={t} className="flex items-center gap-2">
            <RiskIcon tier={t} size={14} />
            {RISK_UI[t].label}
          </span>
        ))}
      </div>

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
        {fallbackNote ?? (view === "globe" ? "DRAG TO TURN · CLICK INDIA TO FLY IN" : "")}
      </p>
    </div>
  );
}
