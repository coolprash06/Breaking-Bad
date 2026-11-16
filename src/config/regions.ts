import type { DistrictId, Region } from "@/lib/types";

/** Locations are ILLUSTRATIVE placeholders until the team confirms districts / villages. */
export const ILLUSTRATIVE_LOCATIONS_NOTE =
  "Illustrative locations: placeholder districts, not confirmed village sites.";

export const REGIONS: Record<Region, { label: string; state: string }> = {
  thar: { label: "Thar Desert", state: "Rajasthan" },
  kutch: { label: "Kutch", state: "Gujarat" },
};

export const DISTRICTS: Record<
  DistrictId,
  { label: string; labelHi: string; region: Region; lat: number; lon: number }
> = {
  jaisalmer: { label: "Jaisalmer", labelHi: "जैसलमेर", region: "thar", lat: 26.91, lon: 70.91 },
  barmer: { label: "Barmer", labelHi: "बाड़मेर", region: "thar", lat: 25.75, lon: 71.39 },
  bikaner: { label: "Bikaner", labelHi: "बीकानेर", region: "thar", lat: 28.02, lon: 73.31 },
  phalodi: { label: "Phalodi", labelHi: "फलोदी", region: "thar", lat: 27.13, lon: 72.36 },
  bhuj: { label: "Bhuj", labelHi: "भुज", region: "kutch", lat: 23.25, lon: 69.67 },
  rapar: { label: "Rapar", labelHi: "रापर", region: "kutch", lat: 23.57, lon: 70.64 },
  banni: { label: "Banni grasslands", labelHi: "बन्नी", region: "kutch", lat: 23.76, lon: 69.58 },
  lakhpat: { label: "Lakhpat", labelHi: "लखपत", region: "kutch", lat: 23.83, lon: 68.78 },
};

export const DISTRICT_IDS = Object.keys(DISTRICTS) as DistrictId[];
