import type { Region, SourceType } from "@/lib/types";

/**
 * Each source type behaves differently (PRD Section 5).
 * Local terms (baori, nadi, tanka, beri, virda) are flagged in the PRD as
 * "verify before using in the pitch".
 */
export const SOURCE_TYPES: Record<
  SourceType,
  { label: string; behaviour: string }
> = {
  dug_well: {
    label: "Open dug well",
    behaviour: "Shallow groundwater; slow aquifer decline plus direct drawing.",
  },
  borewell: {
    label: "Borewell / tubewell",
    behaviour: "Deep groundwater; driven by pumping and regional depletion.",
  },
  stepwell: {
    label: "Stepwell (baori)",
    behaviour: "Open groundwater-fed well; some evaporation, bathing and pilgrim use.",
  },
  nadi: {
    label: "Village pond (nadi)",
    behaviour: "Fills from monsoon runoff; loses water to heat, seepage and use.",
  },
  tanka: {
    label: "Covered rainwater tank (tanka)",
    behaviour: "Filled by rain on its catchment; covered, so little evaporation.",
  },
  beri_virda: {
    label: "Shallow fresh-water pit",
    behaviour: "Taps a thin fresh-water layer; refills slowly by seepage.",
  },
  oasis: {
    label: "Natural water body / wetland",
    behaviour: "Large surface water; evaporation-dominated.",
  },
};

/** beri in Thar, virda in Kutch. */
export function sourceTypeLabel(type: SourceType, region: Region): string {
  if (type === "beri_virda") {
    return region === "thar" ? "Shallow pit (beri)" : "Shallow pit (virda)";
  }
  return SOURCE_TYPES[type].label;
}
