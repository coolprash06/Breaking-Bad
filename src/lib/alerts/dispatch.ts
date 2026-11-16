/**
 * Warning dispatch from the engine (F5/F6). Pure: given every source's status on
 * a batch date and the warnings already sent, decide which new SMS go out.
 *
 * Rules
 *  - A source sends when its tier ESCALATES above the highest tier already sent
 *    for it (Watch < Warning < Emergency). Stepping back down sends nothing.
 *  - Going Grey (no data) sends one "please check and reply" message.
 *  - Never twice for the same source + tier (dedupe key `${sourceId}|${tier}`).
 *  - Recipients: every persona that uses the source (see recipientsFor), plus officers.
 * Delivery is SIMULATED: messages go to the in-app basic phone and the dispatch log.
 */
import { PERSONAS, defaultLang, recipientsFor, type Recipients } from "@/config/personas";
import type { PersonaCategory } from "@/lib/types";
import type { DisplayTier } from "./tiers";
import { nearestSafe, type Candidate } from "./nearest";
import { personaWarning, type Bilingual, type Lang, type ScenarioLite, type SourceLite } from "./warnings";

export interface DispatchMessage {
  id: string;
  /** Dedupe key: one message set per source + tier. */
  key: string;
  /** Batch date the engine detected the change (demo time). */
  date: string;
  sourceId: string;
  sourceName: string;
  tier: DisplayTier;
  personaId: string;
  category: PersonaCategory;
  recipients: Recipients;
  /** Language the group receives it in. Both are kept for the phone's toggle. */
  lang: Lang;
  text: Bilingual;
  /** Suggested alternative, for the map link. */
  alt: { id: string; km: number } | null;
}

/** A reply typed on the simulated phone (F9: 1 = water low, 2 = still fine). */
export interface FieldReply {
  id: string;
  date: string;
  messageId: string;
  sourceId: string;
  sourceName: string;
  personaId: string;
  value: 1 | 2;
}

const RANK: Partial<Record<DisplayTier, number>> = { watch: 1, warning: 2, emergency: 3 };

export const dispatchKey = (sourceId: string, tier: DisplayTier) => `${sourceId}|${tier}`;

/** Sources whose change on this date should send warnings. */
export function escalations(sources: SourceLite[], sent: Iterable<string>): SourceLite[] {
  const sentSet = new Set(sent);
  const maxRank = new Map<string, number>();
  for (const k of sentSet) {
    const [id, tier] = k.split("|");
    maxRank.set(id, Math.max(maxRank.get(id) ?? 0, RANK[tier as DisplayTier] ?? 0));
  }
  return sources.filter((s) => {
    const t = s.status.tier;
    if (t === "safe" || sentSet.has(dispatchKey(s.id, t))) return false;
    if (t === "nodata") return true;
    return (RANK[t] ?? 0) > (maxRank.get(s.id) ?? 0);
  });
}

export function planDispatch(args: {
  asOf: string;
  sources: SourceLite[];
  sent: Iterable<string>;
  /** Pumping-cut re-runs for the escalating pumped sources. */
  scenarios: Record<string, ScenarioLite | null>;
}): DispatchMessage[] {
  const { asOf, sources } = args;
  const candidates: Candidate[] = sources.map((x) => ({ source: x, tier: x.status.tier }));
  const out: DispatchMessage[] = [];
  for (const s of escalations(sources, args.sent)) {
    const tier = s.status.tier;
    const needsTankers = s.people.households > 0 && !nearestSafe(s, candidates, "drink", 8).within;
    for (const p of PERSONAS) {
      const recipients = recipientsFor(p, s, { needsTankers, tier });
      if (!recipients) continue;
      const w = personaWarning(p, s, sources, asOf, { scenario: args.scenarios[s.id] });
      out.push({
        id: `${asOf}|${s.id}|${tier}|${p.id}`,
        key: dispatchKey(s.id, tier),
        date: asOf,
        sourceId: s.id,
        sourceName: s.name,
        tier,
        personaId: p.id,
        category: p.category,
        recipients,
        lang: defaultLang(p),
        text: { en: w.text, hi: w.hi },
        alt: w.nearest.within ? { id: w.nearest.within.source.id, km: w.nearest.within.km } : null,
      });
    }
  }
  return out;
}
