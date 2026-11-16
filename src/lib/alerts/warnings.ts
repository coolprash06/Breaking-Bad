/**
 * Persona-specific warnings (F5), in English and simple Hindi. Pure: used by the
 * dispatch route on the server and by the persona panel in the browser.
 *
 * Every number comes from engine output: tier, failure window (weeks), confidence,
 * the top reason, the nearest suitable Safe source with its distance, the "act by"
 * date (early P10 edge of the failure window) and, for farmers, the pumping-cut
 * scenario re-run. Nothing is hard-coded per source.
 *
 * Each message is fitted to at most 2 SMS segments per language (306 GSM-7 chars
 * for English, 134 UCS-2 chars for Hindi) by dropping optional parts, lowest
 * priority first. English uses only GSM-7 characters so it never falls back to UCS-2.
 */
import type { WaterSource } from "@/lib/types";
import type { Persona, SourceNeed } from "@/config/personas";
import { DISTRICTS } from "@/config/regions";
import { addDays } from "@/lib/time";
import { smsInfo } from "@/lib/sms/segments";
import type { DisplayTier, RiskTier } from "./tiers";
import type { ReasonSms } from "./reasons";
import { formatKm, nearestSafe, type Candidate, type NearestResult } from "./nearest";

export type Lang = "en" | "hi";
export interface Bilingual {
  en: string;
  hi: string;
}

/** The slice of a source's status the warnings need (matches /api/sources). */
export interface StatusLite {
  tier: DisplayTier;
  riskTier: RiskTier;
  confidence: number;
  windowLabel: string;
  window: { fromWeeks: number; toWeeks: number | null };
  ttf: { p10: number | null; p50: number | null; p90: number | null };
  lastReading: { date: string; value: number; daysAgo: number } | null;
  /** Short form of the top cause, if any. */
  reasonSms: ReasonSms | null;
}

export interface SourceLite extends WaterSource {
  status: StatusLite;
}

/** Result of re-running the forecast with farm pumping cut (from compareScenario). */
export interface ScenarioLite {
  cutPct: number;
  extraDays: number | null;
  beyondHorizon: boolean;
}

export interface PersonaWarning {
  /** English SMS text. */
  text: string;
  /** Hindi SMS text. */
  hi: string;
  /** Is this an actual warning (Watch or worse, or no data) rather than an all-clear? */
  isAlert: boolean;
  nearest: NearestResult;
}

/** Most messages fit in 1 SMS; none may need more than 2. */
export const MAX_SEGMENTS = 2;

// ---------- Words ----------

/** Hindi word for each source type, and whether it is feminine (for verb agreement). */
const HI_TYPE: Record<string, { word: string; fem: boolean }> = {
  Nadi: { word: "नाडी", fem: true },
  Tanka: { word: "टांका", fem: false },
  Beri: { word: "बेरी", fem: true },
  Virda: { word: "विरडा", fem: false },
  Well: { word: "कुआँ", fem: false },
  Borewell: { word: "बोरवेल", fem: false },
  Tubewell: { word: "ट्यूबवेल", fem: false },
  Stepwell: { word: "बावड़ी", fem: true },
  Lake: { word: "झील", fem: true },
};

/** "Well #22" -> "कुआँ नं.22" */
export function hindiName(name: string): string {
  const m = /^(\w+) #(\d+)$/.exec(name);
  if (!m || !HI_TYPE[m[1]]) return name;
  return `${HI_TYPE[m[1]].word} नं.${m[2]}`;
}

/** Verb ending that agrees with the source's gender: सकता / सकती. */
function hiAgree(name: string, masc: string, fem: string): string {
  return HI_TYPE[name.split(" ")[0]]?.fem ? fem : masc;
}

const HI_MONTHS = ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateWords(iso: string): Bilingual {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7)) - 1;
  return { en: `${d} ${EN_MONTHS[m]}`, hi: `${d} ${HI_MONTHS[m]}` };
}

function kmWords(km: number): Bilingual {
  const en = formatKm(km);
  return { en, hi: en.replace("km", "किमी") };
}

const TIER_WORD: Record<DisplayTier, Bilingual> = {
  safe: { en: "SAFE", hi: "सुरक्षित" },
  watch: { en: "WATCH", hi: "निगरानी" },
  warning: { en: "WARNING", hi: "चेतावनी" },
  emergency: { en: "EMERGENCY", hi: "खतरा" },
  nodata: { en: "NO DATA", hi: "डेटा नहीं" },
};

const NEED_EN: Record<SourceNeed, string> = {
  drink: "drinking water",
  animals: "water for animals",
  onspot: "water for bathing and washing",
  none: "water",
};
const NEED_HI: Record<SourceNeed, string> = {
  drink: "पीने का",
  animals: "पशुओं का",
  onspot: "नहाने का",
  none: "",
};

const pct = (c: number) => `${Math.round(c * 100)}%`;

/** The engine's window in words: "in 3-5 weeks" / "3-5 हफ्ते में". */
function when(s: StatusLite): Bilingual {
  const { fromWeeks: a, toWeeks: b } = s.window;
  if (b === null) return { en: `beyond ${a} weeks`, hi: `${a} हफ्ते बाद` };
  if (b <= 1) return { en: "within 1 week", hi: "1 हफ्ते के अंदर" };
  return { en: `in ${a}-${b} weeks`, hi: `${a}-${b} हफ्ते में` };
}

/** Already at (or within a day of) failure. */
const dryNow = (s: StatusLite) => s.ttf.p50 !== null && s.ttf.p50 <= 1;

/** Date to act by: the early (P10) edge of the failure window. */
function actBy(s: StatusLite, asOf: string): Bilingual | null {
  const d = s.ttf.p10 ?? s.ttf.p50;
  if (d === null) return null;
  return dateWords(addDays(asOf, Math.max(1, Math.floor(d))));
}

// ---------- Fitting to SMS segments ----------

interface Part {
  en: string;
  hi: string;
  /** Optional parts are dropped (highest number first) until the text fits. 0 = required. */
  drop?: number;
  /** A shorter wording, tried before anything is dropped. */
  short?: Bilingual;
}

function fit(parts: Part[], lang: Lang): string {
  let keep = parts.filter((p) => p[lang]);
  const join = () => keep.map((p) => p[lang]).join(" ");
  while (smsInfo(join()).segments > MAX_SEGMENTS) {
    const longer = keep.find((p) => p.short);
    if (longer) {
      keep = keep.map((p) => (p === longer ? { ...p, ...longer.short, short: undefined } : p));
      continue;
    }
    const worst = keep.reduce<Part | null>((w, p) => ((p.drop ?? 0) > (w?.drop ?? 0) ? p : w), null);
    if (!worst) break; // only required parts left; a test guards that this never happens
    keep = keep.filter((p) => p !== worst);
  }
  return join();
}

function build(parts: Part[]): Bilingual {
  return { en: fit(parts, "en"), hi: fit(parts, "hi") };
}

// ---------- Parts ----------

/** "नाडी नं.9 1-3 हफ्ते में सूख सकती है" */
function mayDryHi(name: string, w: Bilingual): string {
  return `${hindiName(name)} ${w.hi} सूख ${hiAgree(name, "सकता", "सकती")} है`;
}

function head(name: string, s: StatusLite): Part {
  const hn = hindiName(name);
  const c = pct(s.confidence);
  const w = when(s);
  if (s.tier === "emergency" && dryNow(s)) {
    return { en: `URGENT: ${name} is running dry now (${c} sure).`, hi: `तुरंत ध्यान दें: ${hn} का पानी लगभग खत्म है (${c} पक्का)।` };
  }
  switch (s.tier) {
    case "watch":
      return {
        en: `${name}: water falling faster than usual. May run dry ${w.en} (${c} sure).`,
        hi: `${hn} तेजी से घट ${hiAgree(name, "रहा", "रही")} है, ${w.hi} सूख ${hiAgree(name, "सकता", "सकती")} है (${c} पक्का)।`,
      };
    case "emergency":
      return { en: `URGENT: ${name} may run dry ${w.en} (${c} sure).`, hi: `तुरंत ध्यान दें: ${mayDryHi(name, w)} (${c} पक्का)।` };
    default:
      return { en: `WARNING: ${name} may run dry ${w.en} (${c} sure).`, hi: `चेतावनी: ${mayDryHi(name, w)} (${c} पक्का)।` };
  }
}

function reason(s: StatusLite, drop: number): Part {
  return s.reasonSms ? { ...s.reasonSms, drop } : { en: "", hi: "" };
}

/** "No safe water for animals within 25 km. Contact the Panchayat." */
function noneWithin(persona: Persona, n: NearestResult): Part[] {
  const closest = n.closest
    ? {
        en: `The closest is ${n.closest.source.name}, ${kmWords(n.closest.km).en} away.`,
        hi: `सबसे पास ${hindiName(n.closest.source.name)} है, ${kmWords(n.closest.km).hi} दूर।`,
        drop: 3,
      }
    : { en: "", hi: "" };
  return [
    {
      en: `No safe ${NEED_EN[persona.need]} found within ${persona.maxKm} km.`,
      hi: `${persona.maxKm} किमी में ${NEED_HI[persona.need]} सुरक्षित पानी नहीं।`,
    },
    closest,
    { en: "Contact the Panchayat.", hi: "पंचायत से बात करें।" },
  ];
}

/** What a field persona should do, naming the nearest suitable Safe source. */
function fieldAction(persona: Persona, n: NearestResult, by: Bilingual | null, soft: boolean): Part[] {
  if (!n.within) return noneWithin(persona, n);
  const alt = n.within.source.name;
  const altHi = hindiName(alt);
  const km = kmWords(n.within.km);
  const byEn = by ? ` by ${by.en}` : "";
  const byHi = by ? `${by.hi} तक ` : "";
  const ready: Part = soft ? { en: "Be ready:", hi: "तैयार रहें:", drop: 2 } : { en: "", hi: "" };
  switch (persona.id) {
    case "herder":
      return [ready, { en: `Move herds to ${alt} (${km.en})${byEn}.`, hi: `${byHi}पशुओं को ${altHi} (${km.hi}) ले जाएँ।` }];
    case "bathing":
      return [ready, { en: `Move bathing and washing to ${alt} (${km.en})${byEn}.`, hi: `${byHi}नहाने-धोने को ${altHi} (${km.hi}) जाएँ।` }];
    case "tanker":
      return [ready, { en: `Fill tankers at ${alt} (${km.en} away)${byEn}.`, hi: `${byHi}टैंकर ${altHi} (${km.hi}) से भरें।` }];
    case "traveller":
      return [ready, { en: `Travellers: drink and refill at ${alt} (${km.en})${byEn}.`, hi: `यात्री ${byHi}${altHi} (${km.hi}) से पानी भरें।` }];
    default:
      return [
        ready,
        { en: `Get drinking water from ${alt}, ${km.en} away${byEn}.`, hi: `${byHi}पीने का पानी ${altHi} (${km.hi}) से लाएँ।` },
      ];
  }
}

function farmerAction(sc: ScenarioLite | null | undefined): Part {
  if (!sc || sc.extraDays === null) {
    return { en: "Cut pumping now to keep the shared water longer.", hi: "अभी पंपिंग कम करें ताकि गाँव का पानी ज़्यादा दिन चले।" };
  }
  const p = sc.cutPct;
  const weeks = Math.floor(sc.extraDays / 7);
  if (sc.beyondHorizon) {
    return { en: `Cut pumping ${p}% now: it lasts ${weeks}+ more weeks.`, hi: `पंपिंग ${p}% कम करें तो पानी ${weeks}+ हफ्ते ज़्यादा चलेगा।` };
  }
  if (weeks >= 1) {
    return {
      en: `Cut pumping ${p}% now to keep it going about ${weeks} more week${weeks === 1 ? "" : "s"}.`,
      hi: `पंपिंग ${p}% कम करें तो पानी करीब ${weeks} हफ्ते ज़्यादा चलेगा।`,
    };
  }
  const d = Math.max(0, sc.extraDays);
  return { en: `Cutting pumping ${p}% adds only ${d} days. Plan other water.`, hi: `पंपिंग ${p}% कम करने से सिर्फ ${d} दिन बढ़ेंगे। दूसरा इंतज़ाम करें।` };
}

/** Category 4: short summary for the district (sources at risk, people affected). */
function manageParts(persona: Persona, source: SourceLite, all: SourceLite[], candidates: Candidate[]): Part[] {
  const s = source.status;
  const d = DISTRICTS[source.district];
  const atRisk = all.filter((x) => x.district === source.district && x.status.tier !== "safe");
  const hh = atRisk.reduce((a, x) => a + x.people.households, 0);
  const an = atRisk.reduce((a, x) => a + x.people.animals, 0);
  const farms = atRisk.reduce((a, x) => a + x.people.farms, 0);
  const w = when(s);
  const c = pct(s.confidence);
  const drink = nearestSafe(source, candidates, "drink", 8);
  const tier = TIER_WORD[s.tier];
  const statusPart: Part =
    s.tier === "nodata"
      ? {
          en: `${source.name}: NO DATA for ${s.lastReading?.daysAgo ?? "many"} days. Last estimate: dry ${w.en} (${c} sure).`,
          hi: `${hindiName(source.name)}: ${s.lastReading?.daysAgo ?? "कई"} दिन से सेंसर बंद, अनुमान ${w.hi.replace(/ में$/, "")} (${c})।`,
        }
      : { en: `${source.name} now ${tier.en}: dry ${w.en} (${c} sure).`, hi: `${tier.hi}: ${mayDryHi(source.name, w)} (${c})।` };
  const groups = (xs: [number, string, string][]) => xs.filter(([n]) => n > 0);
  const who = groups([
    [hh, "households", "घर"],
    [an, "animals", "पशु"],
    [farms, farms === 1 ? "farm" : "farms", "खेत"],
  ]);
  const summary: Part = {
    en: `${d.label}: ${atRisk.length} source${atRisk.length === 1 ? "" : "s"} at risk${who.map(([n, e]) => `, ${n.toLocaleString("en-IN")} ${e}`).join("")}.`,
    hi: `${d.labelHi}: ${atRisk.length} स्रोत खतरे में${who.map(([n, , h]) => `, ${n} ${h}`).join("")}।`,
    // Hindi only, if needed: keep households (drinking water first), drop animals and farms.
    short: {
      en: `${d.label}: ${atRisk.length} source${atRisk.length === 1 ? "" : "s"} at risk${who.map(([n, e]) => `, ${n.toLocaleString("en-IN")} ${e}`).join("")}.`,
      hi: `${d.labelHi}: ${atRisk.length} स्रोत खतरे में${hh ? `, ${hh} घर` : ""}।`,
    },
  };
  const plan: Part = drink.within
    ? {
        en: `Safe drinking water: ${drink.within.source.name} (${kmWords(drink.within.km).en}).`,
        hi: `पीने का पानी: ${hindiName(drink.within.source.name)} (${kmWords(drink.within.km).hi})।`,
        drop: 1,
      }
    : source.people.households > 0
      ? { en: "No safe drinking water within 8 km: send tankers.", hi: "पास में पानी नहीं, टैंकर भेजें।" }
      : { en: "", hi: "" };
  const parts = [statusPart, summary, plan];
  if (persona.id === "ngo") parts.reverse();
  return parts;
}

// ---------- Entry point ----------

export function personaWarning(
  persona: Persona,
  source: SourceLite,
  all: SourceLite[],
  asOf: string,
  opts: { scenario?: ScenarioLite | null } = {},
): PersonaWarning {
  const s = source.status;
  const candidates: Candidate[] = all.map((x) => ({ source: x, tier: x.status.tier }));
  const nearest = nearestSafe(source, candidates, persona.need, persona.maxKm);
  const isAlert = s.tier !== "safe";
  const out = (b: Bilingual): PersonaWarning => ({ text: b.en, hi: b.hi, isAlert, nearest });
  const name = source.name;
  const hn = hindiName(name);
  const c = pct(s.confidence);

  if (persona.category === "manage") return out(build(manageParts(persona, source, all, candidates)));

  if (s.tier === "nodata") {
    const days = s.lastReading?.daysAgo;
    const w = when(s);
    return out(
      build([
        {
          en: `${name}: no sensor reading for ${days ?? "many"} days. Last estimate: may run dry ${w.en} (${c} sure).`,
          hi: `${hn} का सेंसर ${days ?? "कई"} दिन से बंद है। अनुमान: ${w.hi} पानी खत्म (${c} पक्का)।`,
        },
        { en: "Please check the water and reply 1 = low, 2 = fine.", hi: "पानी देखकर जवाब भेजें: 1 = कम, 2 = ठीक।" },
        ...(persona.need === "none" ? [] : fieldAction(persona, nearest, null, true).map((p) => ({ ...p, drop: p.drop ?? 2 }))),
      ]),
    );
  }

  if (!isAlert) {
    return out({
      en: `${name} is safe: not expected to run dry for ${s.window.fromWeeks}+ weeks (${c} sure). No action needed.`,
      hi: `${hn} सुरक्षित है: ${s.window.fromWeeks}+ हफ्ते तक पानी रहेगा (${c} पक्का)। अभी कुछ करने की ज़रूरत नहीं।`,
    });
  }

  if (persona.id === "farmer") return out(build([head(name, s), reason(s, 1), farmerAction(opts.scenario)]));

  const by = actBy(s, asOf);
  return out(build([head(name, s), reason(s, 1), ...fieldAction(persona, nearest, by, s.tier === "watch")]));
}
