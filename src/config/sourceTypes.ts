import type { Region, SourceType } from "@/lib/types";

/**
 * drinkable: suitable to suggest as household drinking water. Open ponds and
 * wetlands are shared with livestock, so they are never suggested for drinking.
 *
 * Each source type behaves differently (PRD Section 5).
 * Local terms (baori, nadi, tanka, beri, virda) are flagged in the PRD as
 * "verify before using in the pitch".
 */
export const SOURCE_TYPES: Record<
  SourceType,
  { label: string; behaviour: string; drinkable: boolean }
> = {
  dug_well: {
    label: "Open dug well",
    behaviour: "Shallow groundwater; slow aquifer decline plus direct drawing.",
    drinkable: true,
  },
  borewell: {
    label: "Borewell / tubewell",
    behaviour: "Deep groundwater; driven by pumping and regional depletion.",
    drinkable: true,
  },
  stepwell: {
    label: "Stepwell (baori)",
    behaviour: "Open groundwater-fed well; some evaporation, bathing and pilgrim use.",
    drinkable: true,
  },
  nadi: {
    label: "Village pond (nadi)",
    behaviour: "Fills from monsoon runoff; loses water to heat, seepage and use.",
    drinkable: false,
  },
  tanka: {
    label: "Covered rainwater tank (tanka)",
    behaviour: "Filled by rain on its catchment; covered, so little evaporation.",
    drinkable: true,
  },
  beri_virda: {
    label: "Shallow fresh-water pit",
    behaviour: "Taps a thin fresh-water layer; refills slowly by seepage.",
    drinkable: true,
  },
  oasis: {
    label: "Natural water body / wetland",
    behaviour: "Large surface water; evaporation-dominated.",
    drinkable: false,
  },
};

/** beri in Thar, virda in Kutch. */
export function sourceTypeLabel(type: SourceType, region: Region): string {
  if (type === "beri_virda") {
    return region === "thar" ? "Shallow pit (beri)" : "Shallow pit (virda)";
  }
  return SOURCE_TYPES[type].label;
}
