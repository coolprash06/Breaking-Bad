/**
 * Loads the REAL inputs that drive the simulation (Node only: generator script and tests).
 * Missing files simply mean "use the fully simulated drivers".
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ClimateData, Dataset } from "@/lib/types";
import type { GwraData } from "@/lib/real/types";

export interface RealInputs {
  /** REAL daily rain / temperature / ET0 per source (Open-Meteo, ERA5). */
  climate?: Dataset<ClimateData>;
  /** REAL district groundwater balance (CGWB GWRA 2025). */
  gwra?: GwraData;
}

export function loadRealInputs(dir = path.join(process.cwd(), "data", "real")): RealInputs {
  const read = <T>(name: string): T | undefined => {
    const file = path.join(dir, name);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : undefined;
  };
  const climate = read<Dataset<ClimateData>>("climate.json");
  if (climate && climate.provenance !== "REAL") throw new Error("data/real/climate.json must be labelled REAL");
  return { climate, gwra: read<GwraData>("gwra-2025.json") };
}
