"use client";

/**
 * Interactive 3D globe (react-three-fiber). Rest of the world = plain land with
 * no borders; India = Survey of India boundary, highlighted. Water sources glow.
 *
 * Performance safeguards:
 *  - loaded lazily (next/dynamic, ssr: false) by MapStage
 *  - pixel ratio capped at 1.5
 *  - frameloop="demand": nothing renders unless something moves
 *  - slow-frame detection during the intro -> onSlow() and MapStage falls back to 2D
 *  - WebGL context loss -> onSlow()
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { geoContains, geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import type { GeoBundle } from "@/lib/geo/boundaries";
import type { DisplayTier } from "@/lib/alerts/tiers";
import type { ZoomApi } from "./FlatMap";

export interface GlobeApi extends ZoomApi {
  flyToRegion(done: () => void): void;
}

export interface GlobeMarker {
  id: string;
  lat: number;
  lon: number;
  tier: DisplayTier;
}

interface Props {
  geo: GeoBundle;
  markers: GlobeMarker[];
  apiRef: RefObject<GlobeApi | null>;
  /** Changes whenever the colour theme changes, so textures are redrawn. */
  themeKey: string;
  onIndiaClick(): void;
  onSlow(reason: string): void;
}

const DEG = Math.PI / 180;
const HOME_DIST = 3.9;
const MIN_DIST = 1.45;
const MAX_DIST = 6;
/** Rotation that puts (lat, lon) facing the camera. */
const face = (lat: number, lon: number) => ({ rx: lat * DEG, ry: -Math.PI / 2 - lon * DEG });
const INDIA = face(22.5, 79);
const THAR_KUTCH = face(25.8, 71);

function latLonToVec(lat: number, lon: number, r: number): THREE.Vector3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Equirectangular texture: sea, faint graticule, borderless land, glowing India. */
function makeSurfaceTexture(geo: GeoBundle): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  const path = geoPath(proj, ctx);

  ctx.fillStyle = cssVar("--sea");
  ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = cssVar("--line");
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  path(geo.land);
  ctx.fillStyle = cssVar("--land");
  ctx.fill();

  ctx.beginPath();
  path(geo.india);
  ctx.fillStyle = cssVar("--india");
  ctx.fill();
  ctx.save();
  ctx.shadowColor = cssVar("--lab-glow");
  ctx.shadowBlur = 14;
  ctx.strokeStyle = cssVar("--india-line");
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeDotTexture(soft: boolean): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  if (soft) {
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.25, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.6, "rgba(255,255,255,1)");
    g.addColorStop(0.75, "rgba(255,255,255,0)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

const ATMO_VERT = /* glsl */ `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vNormal;
void main() {
  float i = pow(clamp(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 4.0) * uStrength;
  gl_FragColor = vec4(uColor, i);
}`;

interface Motion {
  rx: number;
  ry: number;
  dist: number;
}

function Scene({ geo, markers, apiRef, themeKey, onIndiaClick, onSlow }: Props) {
  const group = useRef<THREE.Group>(null);
  const { camera, invalidate, gl } = useThree();
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const cur = useRef<Motion>(reduced ? { ...INDIA, dist: HOME_DIST } : { rx: 0.2, ry: INDIA.ry + 1.4, dist: HOME_DIST + 0.6 });
  const anim = useRef<{ from: Motion; to: Motion; t0: number; ms: number; done?: () => void } | null>(null);
  const frames = useRef<number[]>([]);
  const slowReported = useRef(false);
  const dragRef = useRef<{ x: number; y: number; m: Motion } | null>(null);

  const tweenTo = (to: Partial<Motion>, ms: number, done?: () => void) => {
    const from = { ...cur.current };
    anim.current = { from, to: { ...from, ...to }, t0: performance.now(), ms, done };
    invalidate();
  };

  // Intro: ease round to India, then stop rendering.
  useEffect(() => {
    if (!reduced) tweenTo({ ...INDIA, dist: HOME_DIST }, 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current = {
      zoomIn: () => tweenTo({ dist: Math.max(MIN_DIST, cur.current.dist / 1.3) }, 300),
      zoomOut: () => tweenTo({ dist: Math.min(MAX_DIST, cur.current.dist * 1.3) }, 300),
      reset: () => tweenTo({ ...INDIA, dist: HOME_DIST }, 800),
      flyToRegion: (done) => tweenTo({ ...THAR_KUTCH, dist: MIN_DIST }, reduced ? 1 : 1100, done),
    };
  });

  // Drag to turn, wheel to zoom.
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      anim.current = null;
      dragRef.current = { x: e.clientX, y: e.clientY, m: { ...cur.current } };
    };
    const move = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const k = 0.005 * (cur.current.dist / HOME_DIST);
      cur.current = {
        ...cur.current,
        ry: drag.m.ry + (e.clientX - drag.x) * k,
        rx: Math.max(-1.3, Math.min(1.3, drag.m.rx + (e.clientY - drag.y) * k)),
      };
      invalidate();
    };
    const up = () => {
      dragRef.current = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      anim.current = null;
      cur.current = { ...cur.current, dist: Math.max(MIN_DIST, Math.min(MAX_DIST, cur.current.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1))) };
      invalidate();
    };
    const lost = (e: Event) => {
      e.preventDefault();
      onSlow("WebGL context lost");
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("webglcontextlost", lost);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("webglcontextlost", lost);
    };
  }, [gl, invalidate, onSlow]);

  useFrame((_, delta) => {
    const a = anim.current;
    if (a) {
      const t = Math.min(1, (performance.now() - a.t0) / a.ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      cur.current = {
        rx: a.from.rx + (a.to.rx - a.from.rx) * e,
        ry: a.from.ry + (a.to.ry - a.from.ry) * e,
        dist: a.from.dist + (a.to.dist - a.from.dist) * e,
      };
      if (t < 1) invalidate();
      else {
        anim.current = null;
        a.done?.();
      }
      // Slow-device check: median frame time over the first 40 animated frames.
      if (!slowReported.current && frames.current.length < 40) {
        frames.current.push(delta);
        if (frames.current.length === 40) {
          const sorted = [...frames.current].sort((x, y) => x - y);
          if (sorted[20] > 0.055) {
            slowReported.current = true;
            onSlow("Frames too slow for 3D");
          }
        }
      }
    }
    const g = group.current;
    if (g) g.rotation.set(cur.current.rx, cur.current.ry, 0);
    // Tall, narrow stages (phones) need the camera further back to fit the globe's width.
    const aspect = (camera as THREE.PerspectiveCamera).aspect || 1;
    camera.position.set(0, 0, cur.current.dist * Math.max(1, 1.1 / aspect));
    camera.lookAt(0, 0, 0);
  });

  // Theme-dependent resources.
  const surface = useMemo(() => makeSurfaceTexture(geo), [geo, themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const atmoUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(cssVar("--lab")) }, uStrength: { value: 1.6 } }),
    [themeKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const indiaLine = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (const g of geo.indiaGlobe.geometries) {
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const rings of polys)
        for (const ring of rings)
          for (let i = 0; i < ring.length - 1; i++) {
            pts.push(latLonToVec(ring[i][1], ring[i][0], 1.0015), latLonToVec(ring[i + 1][1], ring[i + 1][0], 1.0015));
          }
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [geo]);
  const indiaColor = useMemo(() => new THREE.Color(cssVar("--india-line")), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const markerGeo = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    for (const m of markers) {
      const v = latLonToVec(m.lat, m.lon, 1.012);
      pos.push(v.x, v.y, v.z);
      const c = new THREE.Color(cssVar(`--risk-${m.tier}`));
      col.push(c.r, c.g, c.b);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return bg;
  }, [markers, themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const glowTex = useMemo(() => makeDotTexture(true), []);
  const coreTex = useMemo(() => makeDotTexture(false), []);

  useEffect(() => () => surface.dispose(), [surface]);
  useEffect(() => () => markerGeo.dispose(), [markerGeo]);
  useEffect(() => () => indiaLine.dispose(), [indiaLine]);
  useEffect(() => invalidate(), [themeKey, markers, invalidate]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || !e.uv) return;
    const lon = e.uv.x * 360 - 180;
    const lat = e.uv.y * 180 - 90;
    if (geoContains(geo.indiaGlobe, [lon, lat])) onIndiaClick();
  };

  return (
    <>
      <ambientLight intensity={2.3} />
      <directionalLight position={[-3, 2.5, 4]} intensity={2.4} />
      <group ref={group}>
        <mesh onClick={onClick}>
          <sphereGeometry args={[1, 96, 64]} />
          <meshStandardMaterial map={surface} roughness={1} metalness={0} />
        </mesh>
        <lineSegments geometry={indiaLine}>
          <lineBasicMaterial color={indiaColor} transparent opacity={0.9} />
        </lineSegments>
        <points geometry={markerGeo}>
          <pointsMaterial map={glowTex} size={0.075} sizeAttenuation vertexColors transparent depthWrite={false} />
        </points>
        <points geometry={markerGeo}>
          <pointsMaterial map={coreTex} size={0.018} sizeAttenuation vertexColors transparent depthWrite={false} alphaTest={0.3} />
        </points>
      </group>
      <mesh scale={1.1}>
        <sphereGeometry args={[1, 64, 48]} />
        <shaderMaterial
          vertexShader={ATMO_VERT}
          fragmentShader={ATMO_FRAG}
          uniforms={atmoUniforms}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

export default function Globe(props: Props) {
  return (
    <div className="absolute inset-0 cursor-grab active:cursor-grabbing" role="img" aria-label="3D globe with India highlighted. Drag to turn, click India to fly in.">
    <Canvas
      dpr={[1, 1.5]}
      frameloop="demand"
      flat
      camera={{ fov: 35, near: 0.1, far: 50, position: [0, 0, HOME_DIST] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <Scene {...props} />
    </Canvas>
    </div>
  );
}
