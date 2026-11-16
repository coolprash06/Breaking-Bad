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
