/**
 * Shapes sent from the server to the main screen. Types only, so client
 * components can import them without pulling in the data layer.
 */
import type { ProvenanceEntry } from "@/lib/data/store";
import type { Timeline } from "@/lib/types";
import type { SourceLite, StatusLite } from "@/lib/alerts/warnings";

export interface StatusView extends StatusLite {
  rawTier: StatusLite["riskTier"];
  pending: { to: StatusLite["riskTier"]; daysHeld: number; needed: number } | null;
  since: string;
  label: string;
  summary: string;
  currentLevel: number;
  startKind: "sensor" | "manual" | "none";
  topReasons: string[];
  /** Satellite vegetation signal (F7: cloudy scenes skipped, last clear image used). */
  satellite: {
    ndvi: number | null;
    /** Date of the last clear image (cloudy ones are skipped). */
    lastClear: string | null;
    /** Cloudy images since the last clear one. */
    cloudySince: number;
    /** Images and cloudy images in the history up to the clock date. */
    scenes: number;
    cloudy: number;
    provenance: "REAL" | "SIMULATED";
  };
}

export interface SourceView extends SourceLite {
  status: StatusView;
}

export interface SourcesPayload {
  asOf: string;
  timeline: Timeline;
  provenance: ProvenanceEntry[];
  sources: SourceView[];
}
