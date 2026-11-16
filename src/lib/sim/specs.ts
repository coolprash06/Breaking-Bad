/**
 * SIMULATED source specifications.
 *
 * `hidden` holds the TRUE physical parameters used to generate the data.
 * They are written only to data/simulated/_truth.json (used by tests to check
 * that the forecaster LEARNS them). The app and forecaster never read them.
 *
 * Locations are ILLUSTRATIVE.
 */
import type { DistrictId, Region, SourceType, UsageCategory } from "@/lib/types";

/** Litres drawn per usage unit per day (per pump-hour for "pump"). */
export const LITRES_PER_UNIT: Record<UsageCategory, number> = {
  fetch: 50, // per household per day
  spot: 35, // per animal-equivalent per day
  pump: 8000, // per pump-hour
};

export interface UsageEvent {
  category: UsageCategory;
  from: string;
  /** Inclusive end date; omitted = continues to the end of the timeline. */
  to?: string;
  /** New base usage level during the event (same units as baseUsage). */
  level: number;
  /** Days to ramp linearly from the previous level to `level`. */
  rampDays?: number;
}

export interface SourceSpec {
  id: string;
  name: string;
  type: SourceType;
  region: Region;
  district: DistrictId;
  placeLabel: string;
  lat: number;
  lon: number;
  capacityM: number;
  failureLevelM: number;
  animalCapable: boolean;
  people: { households: number; animals: number; farms: number };
  /** Usable level on the demo date (backward/forward simulation is anchored here). */
  targetLevelAtDemo: number;
  baseUsage: Record<UsageCategory, number>;
  events?: UsageEvent[];
  hidden: {
    /** Effective storage area (m2) that converts drawn volume into level drop. */
    effAreaM2: number;
    /** Level rise (m) per mm of rain. */
    rechargePerMm: number;
    /** Fraction of potential evaporation lost from the level (0 = covered). */
    evapFactor: number;
    /** Constant daily change (m/day): seepage loss (<0), aquifer decline (<0) or inflow (>0). */
    driftPerDay: number;
    /** Day-to-day unexplained variation (m/day). */
    processSd: number;
  };
  sensorSd: number;
  /** Sensor dead since N days before the demo date (shows Grey). */
  deadSensorDaysBeforeDemo?: number;
  /** Keep the demo window free of random gaps / spikes (scripted demo sources). */
  protectDemoWindow?: boolean;
  /** Extra long outages: [from, days]. */
  extraGaps?: { from: string; days: number }[];
}

const DEMO = "2026-11-16";

export const SOURCE_SPECS: SourceSpec[] = [
  // ---------------- THAR (Rajasthan) ----------------
  {
    id: "TH-01", name: "Nadi #1", type: "nadi", region: "thar", district: "jaisalmer",
    placeLabel: "Village pond west of Jaisalmer", lat: 26.95, lon: 70.8,
    capacityM: 2.5, failureLevelM: 0.3, animalCapable: true,
    people: { households: 60, animals: 400, farms: 0 },
    targetLevelAtDemo: 1.1,
    baseUsage: { fetch: 60, spot: 400, pump: 0 },
    hidden: { effAreaM2: 5000, rechargePerMm: 0.014, evapFactor: 1.1, driftPerDay: -0.003, processSd: 0.002 },
    sensorSd: 0.008,
  },
  {
    id: "TH-02", name: "Tanka #2", type: "tanka", region: "thar", district: "jaisalmer",
    placeLabel: "Household tanka cluster, Jaisalmer", lat: 26.85, lon: 70.98,
    capacityM: 3.0, failureLevelM: 0.15, animalCapable: false,
    people: { households: 12, animals: 0, farms: 0 },
    // 1.9 -> 1.85 (16 Nov): with REAL Jaisalmer rain (117 mm/yr) a full tanka cannot end higher.
    targetLevelAtDemo: 1.85,
    baseUsage: { fetch: 12, spot: 0, pump: 0 },
    hidden: { effAreaM2: 45, rechargePerMm: 0.011, evapFactor: 0.05, driftPerDay: -0.0005, processSd: 0.0015 },
    sensorSd: 0.006,
  },
  {
    id: "TH-03", name: "Beri #3", type: "beri_virda", region: "thar", district: "jaisalmer",
    placeLabel: "Beri pits, north-west of Jaisalmer", lat: 27.02, lon: 70.7,
    capacityM: 1.2, failureLevelM: 0.15, animalCapable: false,
    people: { households: 10, animals: 0, farms: 0 },
    // 0.9 -> 0.85 (16 Nov): the most REAL Jaisalmer rain can refill these pits to.
    targetLevelAtDemo: 0.85,
    baseUsage: { fetch: 10, spot: 0, pump: 0 },
    hidden: { effAreaM2: 80, rechargePerMm: 0.004, evapFactor: 0.3, driftPerDay: 0.004, processSd: 0.0015 },
    sensorSd: 0.006,
  },
  {
    // SCRIPTED DEMO: rabi pumping restarts the day after the demo date -> Safe to Warning.
    id: "TH-04", name: "Well #4", type: "dug_well", region: "thar", district: "barmer",
    placeLabel: "Village well near Barmer", lat: 25.8, lon: 71.3,
    capacityM: 10, failureLevelM: 0.5, animalCapable: true,
    people: { households: 120, animals: 80, farms: 2 },
    targetLevelAtDemo: 2.6,
    baseUsage: { fetch: 120, spot: 80, pump: 0 },
    events: [
      { category: "pump", from: "2025-11-17", to: "2026-03-15", level: 1.5 },
      { category: "pump", from: "2026-11-17", level: 2.5, rampDays: 2 },
    ],
    hidden: { effAreaM2: 500, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.012, processSd: 0.003 },
    sensorSd: 0.008,
    protectDemoWindow: true,
  },
  {
    id: "TH-05", name: "Borewell #5", type: "borewell", region: "thar", district: "barmer",
    placeLabel: "Farm borewell south-east of Barmer", lat: 25.7, lon: 71.45,
    capacityM: 30, failureLevelM: 1.0, animalCapable: false,
    people: { households: 0, animals: 0, farms: 4 },
    targetLevelAtDemo: 2.3,
    baseUsage: { fetch: 0, spot: 0, pump: 6 },
    hidden: { effAreaM2: 2500, rechargePerMm: 0.0008, evapFactor: 0, driftPerDay: -0.008, processSd: 0.004 },
    sensorSd: 0.01,
  },
  {
    id: "TH-06", name: "Stepwell #6", type: "stepwell", region: "thar", district: "phalodi",
    placeLabel: "Old stepwell, Phalodi", lat: 27.13, lon: 72.37,
    capacityM: 12, failureLevelM: 0.6, animalCapable: true,
    people: { households: 40, animals: 150, farms: 0 },
    targetLevelAtDemo: 2.0,
    baseUsage: { fetch: 40, spot: 150, pump: 0 },
    hidden: { effAreaM2: 400, rechargePerMm: 0.025, evapFactor: 0.6, driftPerDay: -0.003, processSd: 0.003 },
    sensorSd: 0.008,
    extraGaps: [{ from: "2026-08-04", days: 16 }],
  },
  {
    // The safe alternative about 2 km from Well #4 (PRD example: "Well #7 (2 km) is safe").
    id: "TH-07", name: "Well #7", type: "dug_well", region: "thar", district: "barmer",
    placeLabel: "Second village well near Barmer", lat: 25.815, lon: 71.315,
    capacityM: 10, failureLevelM: 0.5, animalCapable: true,
    people: { households: 90, animals: 60, farms: 0 },
    targetLevelAtDemo: 4.2,
    baseUsage: { fetch: 90, spot: 60, pump: 0 },
    hidden: { effAreaM2: 700, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.006, processSd: 0.0025 },
    sensorSd: 0.008,
  },
  {
    id: "TH-08", name: "Tubewell #8", type: "borewell", region: "thar", district: "bikaner",
    placeLabel: "Canal-area tubewell, Bikaner", lat: 28.05, lon: 73.2,
    capacityM: 40, failureLevelM: 1.5, animalCapable: false,
    people: { households: 0, animals: 0, farms: 5 },
    targetLevelAtDemo: 18,
    baseUsage: { fetch: 0, spot: 0, pump: 8 },
    hidden: { effAreaM2: 3000, rechargePerMm: 0.0008, evapFactor: 0, driftPerDay: -0.008, processSd: 0.004 },
    sensorSd: 0.01,
  },
  {
    id: "TH-09", name: "Nadi #9", type: "nadi", region: "thar", district: "bikaner",
    placeLabel: "Village pond south-east of Bikaner", lat: 27.95, lon: 73.4,
    capacityM: 2.0, failureLevelM: 0.3, animalCapable: true,
    people: { households: 50, animals: 300, farms: 0 },
    targetLevelAtDemo: 0.45,
    baseUsage: { fetch: 50, spot: 300, pump: 0 },
    hidden: { effAreaM2: 3500, rechargePerMm: 0.014, evapFactor: 1.1, driftPerDay: -0.003, processSd: 0.002 },
    sensorSd: 0.008,
  },

  // ---------------- KUTCH (Gujarat) ----------------
  {
    // SCRIPTED DEMO: Maldhari herds arrive 2 days after the demo date -> Safe to Warning.
    id: "KU-10", name: "Nadi #10", type: "nadi", region: "kutch", district: "banni",
    placeLabel: "Grassland pond, Banni", lat: 23.78, lon: 69.55,
    capacityM: 2.2, failureLevelM: 0.3, animalCapable: true,
    people: { households: 20, animals: 2600, farms: 0 },
    targetLevelAtDemo: 1.35,
    baseUsage: { fetch: 20, spot: 350, pump: 0 },
    events: [
      { category: "spot", from: "2026-03-01", to: "2026-03-20", level: 1200, rampDays: 3 },
      { category: "spot", from: "2026-03-21", to: "2026-05-09", level: 350, rampDays: 3 },
      { category: "spot", from: "2026-05-10", to: "2026-06-05", level: 900, rampDays: 3 },
      { category: "spot", from: "2026-06-06", to: "2026-11-17", level: 350, rampDays: 3 },
      { category: "spot", from: "2026-11-18", level: 2600, rampDays: 3 },
    ],
    hidden: { effAreaM2: 6000, rechargePerMm: 0.014, evapFactor: 1.1, driftPerDay: -0.0025, processSd: 0.002 },
    sensorSd: 0.008,
    protectDemoWindow: true,
  },
  {
    id: "KU-11", name: "Virda #11", type: "beri_virda", region: "kutch", district: "banni",
    placeLabel: "Virda pits, Banni", lat: 23.72, lon: 69.62,
    capacityM: 1.0, failureLevelM: 0.1, animalCapable: false,
    people: { households: 8, animals: 0, farms: 0 },
    targetLevelAtDemo: 0.7,
    baseUsage: { fetch: 8, spot: 0, pump: 0 },
    hidden: { effAreaM2: 60, rechargePerMm: 0.004, evapFactor: 0.3, driftPerDay: 0.004, processSd: 0.0015 },
    sensorSd: 0.006,
  },
  {
    // Large wetland: the herd alternative to Nadi #10.
    id: "KU-12", name: "Lake #12", type: "oasis", region: "kutch", district: "banni",
    placeLabel: "Seasonal wetland, north Banni", lat: 23.84, lon: 69.48,
    capacityM: 3.0, failureLevelM: 0.4, animalCapable: true,
    people: { households: 0, animals: 800, farms: 0 },
    targetLevelAtDemo: 2.1,
    baseUsage: { fetch: 0, spot: 800, pump: 0 },
    hidden: { effAreaM2: 60000, rechargePerMm: 0.009, evapFactor: 1.0, driftPerDay: -0.0015, processSd: 0.002 },
    sensorSd: 0.008,
  },
  {
    // Tanker operators started drawing more on 1 Nov: "dropping faster than usual".
    id: "KU-13", name: "Well #13", type: "dug_well", region: "kutch", district: "bhuj",
    placeLabel: "Town-edge well, Bhuj", lat: 23.27, lon: 69.7,
    capacityM: 10, failureLevelM: 0.5, animalCapable: false,
    people: { households: 150, animals: 0, farms: 0 },
    targetLevelAtDemo: 2.4,
    baseUsage: { fetch: 150, spot: 0, pump: 0 },
    events: [{ category: "fetch", from: "2026-11-01", level: 210, rampDays: 4 }],
    hidden: { effAreaM2: 450, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.01, processSd: 0.003 },
    sensorSd: 0.008,
  },
  {
    id: "KU-14", name: "Borewell #14", type: "borewell", region: "kutch", district: "bhuj",
    placeLabel: "Farm borewell west of Bhuj", lat: 23.2, lon: 69.6,
    capacityM: 35, failureLevelM: 1.5, animalCapable: false,
    people: { households: 0, animals: 0, farms: 4 },
    targetLevelAtDemo: 14,
    baseUsage: { fetch: 0, spot: 0, pump: 7 },
    hidden: { effAreaM2: 3000, rechargePerMm: 0.0008, evapFactor: 0, driftPerDay: -0.006, processSd: 0.004 },
    sensorSd: 0.01,
  },
  {
    id: "KU-15", name: "Tanka #15", type: "tanka", region: "kutch", district: "rapar",
    placeLabel: "School tanka, Rapar", lat: 23.55, lon: 70.6,
    capacityM: 3.0, failureLevelM: 0.15, animalCapable: false,
    people: { households: 10, animals: 0, farms: 0 },
    targetLevelAtDemo: 0.6,
    baseUsage: { fetch: 10, spot: 0, pump: 0 },
    hidden: { effAreaM2: 40, rechargePerMm: 0.011, evapFactor: 0.05, driftPerDay: -0.0005, processSd: 0.0015 },
    sensorSd: 0.006,
  },
  {
    // DEAD SENSOR: no readings for the last 13 days -> Grey, wide band.
    id: "KU-16", name: "Well #16", type: "dug_well", region: "kutch", district: "rapar",
    placeLabel: "Village well east of Rapar", lat: 23.6, lon: 70.68,
    capacityM: 10, failureLevelM: 0.5, animalCapable: true,
    people: { households: 100, animals: 100, farms: 1 },
    targetLevelAtDemo: 1.8,
    baseUsage: { fetch: 100, spot: 100, pump: 1 },
    hidden: { effAreaM2: 500, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.012, processSd: 0.003 },
    sensorSd: 0.008,
    deadSensorDaysBeforeDemo: 13,
  },
  {
    id: "KU-17", name: "Stepwell #17", type: "stepwell", region: "kutch", district: "bhuj",
    placeLabel: "Heritage stepwell, Bhuj", lat: 23.24, lon: 69.66,
    capacityM: 12, failureLevelM: 0.6, animalCapable: true,
    people: { households: 50, animals: 120, farms: 0 },
    targetLevelAtDemo: 4.5,
    baseUsage: { fetch: 50, spot: 120, pump: 0 },
    hidden: { effAreaM2: 500, rechargePerMm: 0.009, evapFactor: 0.6, driftPerDay: -0.002, processSd: 0.003 },
    sensorSd: 0.008,
  },
  {
    id: "KU-18", name: "Borewell #18", type: "borewell", region: "kutch", district: "lakhpat",
    placeLabel: "Borewell supplying tankers, Lakhpat", lat: 23.8, lon: 68.85,
    capacityM: 30, failureLevelM: 1.5, animalCapable: false,
    people: { households: 40, animals: 0, farms: 3 },
    targetLevelAtDemo: 6,
    baseUsage: { fetch: 40, spot: 0, pump: 5 },
    hidden: { effAreaM2: 2500, rechargePerMm: 0.0008, evapFactor: 0, driftPerDay: -0.01, processSd: 0.004 },
    sensorSd: 0.01,
  },

  // ---------------- SAFE ALTERNATIVES (added 16 Nov 2026) ----------------
  // So every source except Stepwell #6 (Phalodi, kept isolated on purpose for the
  // honest "no safe source nearby" case) has a suitable Safe alternative within
  // each persona's distance limit. Separate random streams: existing data is unchanged.
  {
    // Alternative for Nadi #1: drinking, herds, bathing.
    id: "TH-19", name: "Well #19", type: "dug_well", region: "thar", district: "jaisalmer",
    placeLabel: "Village well beside Nadi #1, Jaisalmer", lat: 26.96, lon: 70.78,
    capacityM: 10, failureLevelM: 0.5, animalCapable: true,
    people: { households: 40, animals: 150, farms: 0 },
    targetLevelAtDemo: 4.0,
    baseUsage: { fetch: 40, spot: 150, pump: 0 },
    hidden: { effAreaM2: 700, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.006, processSd: 0.0025 },
    sensorSd: 0.008,
    protectDemoWindow: true,
  },
  {
    // Alternative for Tanka #2.
    id: "TH-20", name: "Tanka #20", type: "tanka", region: "thar", district: "jaisalmer",
    placeLabel: "Community tanka, Jaisalmer", lat: 26.88, lon: 70.94,
    capacityM: 3.0, failureLevelM: 0.15, animalCapable: false,
    people: { households: 8, animals: 0, farms: 0 },
    targetLevelAtDemo: 2.5,
    baseUsage: { fetch: 8, spot: 0, pump: 0 },
    hidden: { effAreaM2: 90, rechargePerMm: 0.011, evapFactor: 0.05, driftPerDay: -0.0003, processSd: 0.0012 },
    sensorSd: 0.006,
    protectDemoWindow: true,
  },
  {
    // Alternative for Beri #3.
    id: "TH-21", name: "Tanka #21", type: "tanka", region: "thar", district: "jaisalmer",
    placeLabel: "Tanka near the beri pits, Jaisalmer", lat: 27.0, lon: 70.72,
    capacityM: 3.0, failureLevelM: 0.15, animalCapable: false,
    people: { households: 8, animals: 0, farms: 0 },
    targetLevelAtDemo: 2.5,
    baseUsage: { fetch: 8, spot: 0, pump: 0 },
    hidden: { effAreaM2: 90, rechargePerMm: 0.011, evapFactor: 0.05, driftPerDay: -0.0003, processSd: 0.0012 },
    sensorSd: 0.006,
    protectDemoWindow: true,
  },
  {
    // Alternative for Nadi #9: drinking, herds, bathing.
    id: "TH-22", name: "Well #22", type: "dug_well", region: "thar", district: "bikaner",
    placeLabel: "Village well east of Nadi #9, Bikaner", lat: 27.975, lon: 73.425,
    capacityM: 10, failureLevelM: 0.5, animalCapable: true,
    people: { households: 50, animals: 200, farms: 0 },
    targetLevelAtDemo: 4.3,
    baseUsage: { fetch: 50, spot: 200, pump: 0 },
    hidden: { effAreaM2: 700, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.006, processSd: 0.0025 },
    sensorSd: 0.008,
    protectDemoWindow: true,
  },
  {
    // Drinking water for the village around Borewell #5.
    id: "TH-23", name: "Tanka #23", type: "tanka", region: "thar", district: "barmer",
    placeLabel: "Village tanka near Borewell #5, Barmer", lat: 25.72, lon: 71.48,
    capacityM: 3.0, failureLevelM: 0.15, animalCapable: false,
    people: { households: 10, animals: 0, farms: 0 },
    targetLevelAtDemo: 2.5,
    baseUsage: { fetch: 10, spot: 0, pump: 0 },
    hidden: { effAreaM2: 90, rechargePerMm: 0.011, evapFactor: 0.05, driftPerDay: -0.0003, processSd: 0.0012 },
    sensorSd: 0.006,
    protectDemoWindow: true,
  },
  {
    // Alternative for Nadi #10 and Virda #11.
    id: "KU-24", name: "Well #24", type: "dug_well", region: "kutch", district: "banni",
    placeLabel: "Village well between Nadi #10 and the virda pits, Banni", lat: 23.75, lon: 69.58,
    capacityM: 10, failureLevelM: 0.5, animalCapable: true,
    people: { households: 40, animals: 180, farms: 0 },
    targetLevelAtDemo: 4.1,
    baseUsage: { fetch: 40, spot: 180, pump: 0 },
    hidden: { effAreaM2: 700, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.006, processSd: 0.0025 },
    sensorSd: 0.008,
    protectDemoWindow: true,
  },
  {
    // Alternative for Lake #12 (on-spot use).
    id: "KU-25", name: "Well #25", type: "dug_well", region: "kutch", district: "banni",
    placeLabel: "Herders' well, north Banni", lat: 23.86, lon: 69.5,
    capacityM: 10, failureLevelM: 0.5, animalCapable: true,
    people: { households: 20, animals: 160, farms: 0 },
    targetLevelAtDemo: 4.4,
    baseUsage: { fetch: 20, spot: 160, pump: 0 },
    hidden: { effAreaM2: 700, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.006, processSd: 0.0025 },
    sensorSd: 0.008,
    protectDemoWindow: true,
  },
  {
    // Alternative for Tanka #15 and Well #16.
    id: "KU-26", name: "Well #26", type: "dug_well", region: "kutch", district: "rapar",
    placeLabel: "Village well west of Rapar", lat: 23.585, lon: 70.645,
    capacityM: 10, failureLevelM: 0.5, animalCapable: true,
    people: { households: 45, animals: 120, farms: 0 },
    targetLevelAtDemo: 4.0,
    baseUsage: { fetch: 45, spot: 120, pump: 0 },
    hidden: { effAreaM2: 700, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.006, processSd: 0.0025 },
    sensorSd: 0.008,
    protectDemoWindow: true,
  },
  {
    // Alternative for Stepwell #17 (herds, bathing).
    id: "KU-27", name: "Well #27", type: "dug_well", region: "kutch", district: "bhuj",
    placeLabel: "Village well east of Bhuj", lat: 23.22, lon: 69.69,
    capacityM: 10, failureLevelM: 0.5, animalCapable: true,
    people: { households: 35, animals: 140, farms: 0 },
    targetLevelAtDemo: 4.2,
    baseUsage: { fetch: 35, spot: 140, pump: 0 },
    hidden: { effAreaM2: 700, rechargePerMm: 0.004, evapFactor: 0.1, driftPerDay: 0.006, processSd: 0.0025 },
    sensorSd: 0.008,
    protectDemoWindow: true,
  },
  {
    // Drinking water near Borewell #18.
    id: "KU-28", name: "Tanka #28", type: "tanka", region: "kutch", district: "lakhpat",
    placeLabel: "Village tanka, Lakhpat", lat: 23.82, lon: 68.88,
    capacityM: 3.0, failureLevelM: 0.15, animalCapable: false,
    people: { households: 10, animals: 0, farms: 0 },
    targetLevelAtDemo: 2.5,
    baseUsage: { fetch: 10, spot: 0, pump: 0 },
    hidden: { effAreaM2: 90, rechargePerMm: 0.011, evapFactor: 0.05, driftPerDay: -0.0003, processSd: 0.0012 },
    sensorSd: 0.006,
    protectDemoWindow: true,
  },
];

export const DEMO_DATE = DEMO;
