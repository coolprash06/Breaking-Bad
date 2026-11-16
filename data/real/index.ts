/**
 * REAL data overrides (see README.md here; produced by `npm run fetch-real`).
 *
 * A REAL dataset registered below replaces the SIMULATED one of the same id in
 * the store, and the UI badge flips to REAL automatically.
 *
 * Registered:
 *  - climate: ERA5 daily rain / temperature / FAO-56 ET0 at every source (Open-Meteo).
 *
 * Reference layers (not per-source datasets) are read via src/lib/real/context.ts:
 *  - gwra-2025.json: CGWB Dynamic Ground Water Resources 2025 (district figures, block categories)
 *  - cgwb-wells.json: CGWB observation wells with their depth-to-water history
 */
import type { RealOverrides } from "../../src/lib/data/datasets";
import climate from "./climate.json";

export const REAL_OVERRIDES: RealOverrides = {
  climate: climate as unknown as RealOverrides["climate"],
};
