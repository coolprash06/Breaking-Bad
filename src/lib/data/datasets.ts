import type {
  ClimateData,
  Dataset,
  DatasetId,
  NdviData,
  ObservationData,
  ReadingsData,
  UsageData,
  WaterSource,
} from "@/lib/types";

/** Payload type of each dataset id. */
export interface DatasetMap {
  sources: Dataset<WaterSource[]>;
  readings: Dataset<ReadingsData>;
  usage: Dataset<UsageData>;
  climate: Dataset<ClimateData>;
  ndvi: Dataset<NdviData>;
  observations: Dataset<ObservationData>;
}

export type RealOverrides = Partial<DatasetMap>;

export const DATASET_IDS: DatasetId[] = [
  "sources",
  "readings",
  "usage",
  "climate",
  "ndvi",
  "observations",
];

/** The store refuses any dataset that is not labelled REAL or SIMULATED. */
export function assertLabelled<T extends Dataset<unknown>>(ds: T, id: DatasetId): T {
  if (!ds || (ds.provenance !== "REAL" && ds.provenance !== "SIMULATED")) {
    throw new Error(`Dataset "${id}" is missing a REAL/SIMULATED provenance label.`);
  }
  if (ds.id !== id) {
    throw new Error(`Dataset id mismatch: expected "${id}", got "${ds.id}".`);
  }
  return ds;
}
