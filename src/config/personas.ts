import type { PersonaCategory } from "@/lib/types";

/**
 * What a persona needs from an alternative source when theirs is failing.
 *  drink   = drinkable type and a public drawing point (used for fetching)
 *  animals = marked animal-capable
 *  onspot  = people already use it on the spot (bathing / washing)
 *  none    = no alternative is suggested (farmers, officers)
 */
export type SourceNeed = "drink" | "animals" | "onspot" | "none";

export interface Persona {
  id: string;
  category: PersonaCategory;
  name: string;
  nameHi: string;
  story: string;
  need: SourceNeed;
  /** Furthest distance (km, straight line) we would suggest for this persona. */
  maxKm: number;
  /** How this persona travels, used in the warning text. */
  travel: string;
}

export interface PurposeTab {
  id: PersonaCategory;
  title: string;
  subtitle: string;
  /** What the map emphasises on this tab (PRD 8A). */
  focus: string;
}

export const PURPOSE_TABS: PurposeTab[] = [
  { id: "fetch", title: "Fetch & Carry", subtitle: "Households · tankers", focus: "Nearest safe drinking sources" },
  { id: "spot", title: "Use on Spot", subtitle: "Herders · bathing · travellers", focus: "Sources that can take animals" },
  { id: "pump", title: "Pump at Scale", subtitle: "Farm borewells", focus: "How much pumping to cut" },
  { id: "manage", title: "Manage & Oversee", subtitle: "Panchayat · district · NGOs", focus: "Everyone affected" },
];

export const PERSONAS: Persona[] = [
  {
    id: "household",
    category: "fetch",
    name: "Household water carrier",
    nameHi: "पानी लाने वाली महिलाएँ",
    story: "Walks to the village source twice a day for drinking and cooking water.",
    need: "drink",
    maxKm: 8,
    travel: "on foot",
  },
  {
    id: "tanker",
    category: "fetch",
    name: "Tanker operator",
    nameHi: "टैंकर चालक",
    story: "Fills a 10,000 L tanker and supplies villages without their own source.",
    need: "drink",
    maxKm: 40,
    travel: "by tanker",
  },
  {
    id: "herder",
    category: "spot",
    name: "Herder",
    nameHi: "पशुपालक",
    story: "Waters goats, sheep and camels at the source every evening.",
    need: "animals",
    maxKm: 25,
    travel: "with the herd",
  },
  {
    id: "bathing",
    category: "spot",
    name: "Bathing and washing",
    nameHi: "नहाने-धोने वाले",
    story: "Families bathe and wash clothes at the source.",
    need: "onspot",
    maxKm: 5,
    travel: "on foot",
  },
  {
    id: "traveller",
    category: "spot",
    name: "Travellers and pilgrims",
    nameHi: "यात्री और तीर्थयात्री",
    story: "Stop at the source to drink and rest on long desert routes.",
    need: "drink",
    maxKm: 30,
    travel: "on the route",
  },
  {
    id: "farmer",
    category: "pump",
    name: "Farmer with a borewell",
    nameHi: "बोरवेल वाले किसान",
    story: "Pumps groundwater to irrigate rabi crops; shares the aquifer with the village.",
    need: "none",
    maxKm: 0,
    travel: "",
  },
  {
    id: "panchayat",
    category: "manage",
    name: "Village Panchayat",
    nameHi: "ग्राम पंचायत",
    story: "Directs water use in the village and escalates to the MLA / MP when needed.",
    need: "none",
    maxKm: 0,
    travel: "",
  },
  {
    id: "district",
    category: "manage",
    name: "District water officer",
    nameHi: "ज़िला जल अधिकारी",
    story: "Manages many sources across the district.",
    need: "none",
    maxKm: 0,
    travel: "",
  },
  {
    id: "ngo",
    category: "manage",
    name: "NGO / aid agency",
    nameHi: "स्वयंसेवी संस्था",
    story: "Decides where to send water tankers.",
    need: "none",
    maxKm: 0,
    travel: "",
  },
];

export function personasFor(cat: PersonaCategory): Persona[] {
  return PERSONAS.filter((p) => p.category === cat);
}

/** Farm pumping cut used in the Category 3 "what if" re-run (F5). */
export const PUMP_CUT = 0.3;

/** Field users read in Hindi by default; officers in English. Both are on the phone toggle. */
export function defaultLang(p: Persona): "en" | "hi" {
  return p.category === "manage" ? "en" : "hi";
}

export interface Recipients {
  count: number;
  unit: string;
}

/**
 * SIMULATED recipient lists (no real phone numbers exist in the demo). Counts are
 * derived from the source's registered users:
 *  households: one phone per household     herders: one per ~50 animals
 *  bathing: ~1 in 3 households             tankers: 2 per large drinking source
 *  travellers: a 25-phone route list at stepwells and wells on routes
 *  farmers: one per farm                    officers: one desk each
 * Returns null when this persona does not use the source.
 */
export function recipientsFor(
  p: Persona,
  s: { type: string; usedBy: string[]; animalCapable: boolean; people: { households: number; animals: number; farms: number } },
  opts: { needsTankers?: boolean; tier?: string } = {},
): Recipients | null {
  const { households, animals, farms } = s.people;
  const uses = (c: string) => s.usedBy.includes(c);
  switch (p.id) {
    case "household":
      return uses("fetch") && households > 0 ? { count: households, unit: "households" } : null;
    case "tanker":
      return uses("fetch") && households >= 40 && s.type !== "nadi" ? { count: 2, unit: "tanker operators" } : null;
    case "herder":
      return uses("spot") && s.animalCapable && animals > 0 ? { count: Math.ceil(animals / 50), unit: "herders" } : null;
    case "bathing":
      return uses("spot") && households > 0 ? { count: Math.ceil(households / 3), unit: "families" } : null;
    case "traveller":
      return uses("spot") && (s.type === "stepwell" || s.type === "dug_well") ? { count: 25, unit: "travellers" } : null;
    case "farmer":
      return uses("pump") && farms > 0 ? { count: farms, unit: farms === 1 ? "farm" : "farms" } : null;
    case "panchayat":
      return { count: 1, unit: "Panchayat office" };
    case "district":
      return opts.tier === "watch" ? null : { count: 1, unit: "district water office" };
    case "ngo":
      return opts.tier === "emergency" || opts.needsTankers ? { count: 1, unit: "NGO desk" } : null;
    default:
      return null;
  }
}
