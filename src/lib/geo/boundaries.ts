/**
 * Boundary data for the globe and the flat map (client side).
 * Files live in public/geo (see public/geo/README.md for sources and licences).
 * India is drawn only from the Survey of India boundary; no third-party tiles.
 */
import { geoArea } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";

export interface GeoBundle {
  /** World land, Natural Earth 1:110m. No country borders. */
  land: GeoJSON.GeometryCollection;
  /** India, Survey of India boundary (detailed, for the flat map). */
  india: GeoJSON.GeometryCollection;
  /** India, Survey of India boundary (coarse, for the globe). */
  indiaGlobe: GeoJSON.GeometryCollection;
  /** Internal state lines, Survey of India. */
  stateLines: GeoJSON.GeometryCollection;
}

type AnyGeo = GeoJSON.FeatureCollection | GeoJSON.GeometryCollection | GeoJSON.Geometry;

function toCollection(g: AnyGeo): GeoJSON.GeometryCollection {
  if (g.type === "FeatureCollection") return { type: "GeometryCollection", geometries: g.features.map((f) => f.geometry) };
  if (g.type === "GeometryCollection") return g;
  return { type: "GeometryCollection", geometries: [g] };
}

/**
 * d3-geo treats a polygon as spherical: wound the "wrong" way it covers the
 * whole globe except the shape. Reverse any polygon larger than a hemisphere.
 */
function fixWinding(gc: GeoJSON.GeometryCollection): GeoJSON.GeometryCollection {
  for (const g of gc.geometries) {
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const rings of polys) {
      if (geoArea({ type: "Polygon", coordinates: rings } as GeoPermissibleObjects) > 2 * Math.PI) {
        rings.forEach((r) => r.reverse());
      }
    }
  }
  return gc;
}

let cache: Promise<GeoBundle> | null = null;

export function loadBoundaries(): Promise<GeoBundle> {
  if (!cache) {
    const get = (f: string) =>
      fetch(`/geo/${f}`).then((r) => {
        if (!r.ok) throw new Error(`Could not load /geo/${f}`);
        return r.json() as Promise<AnyGeo>;
      });
    cache = Promise.all([get("world-land.json"), get("india-soi.json"), get("india-soi-globe.json"), get("india-state-lines.json")])
      .then(([land, india, indiaGlobe, lines]) => ({
        land: fixWinding(toCollection(land)),
        india: fixWinding(toCollection(india)),
        indiaGlobe: fixWinding(toCollection(indiaGlobe)),
        stateLines: toCollection(lines),
      }))
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

/** Thar + Kutch frame for the flat map (lon/lat corners). */
export const THAR_KUTCH_FRAME: [[number, number], [number, number]] = [
  [67.6, 22.2],
  [75.2, 30.2],
];
