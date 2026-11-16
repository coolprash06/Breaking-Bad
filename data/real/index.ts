/**
 * REAL data overrides.
 *
 * When a REAL dataset is ready (e.g. CGWB observation wells, CHIRPS rainfall),
 * put its JSON next to this file in the same shape as the matching file in
 * data/simulated/, with "provenance": "REAL", and register it below, e.g.:
 *
 *   import climate from "./climate.json";
 *   export const REAL_OVERRIDES: RealOverrides = { climate: climate as RealOverrides["climate"] };
 *
 * The store then uses the REAL dataset instead of the SIMULATED one, and the
 * UI badge flips to REAL automatically.
 */
import type { RealOverrides } from "../../src/lib/data/datasets";

export const REAL_OVERRIDES: RealOverrides = {};
