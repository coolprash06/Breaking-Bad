/**
 * REAL: CGWB / Ministry of Jal Shakti "National Compilation on Dynamic Ground Water
 * Resources of India, 2025" (GWRA 2025). Parses, from the official PDF:
 *  - the district resources table (recharge, extractable resource, extraction, stage %)
 *  - recharge-worthy area per district and number of assessment units
 *  - block categorisation (semi-critical / critical / over-exploited)
 *  - blocks whose category changed 2024 -> 2025 (these rows print the stage %)
 *  - blocks affected by salinity (quality chapter)
 * Pages are found by their headings, not by fixed page numbers.
 */
import type {
  GwCategory,
  GwraBlock,
  GwraDistrict,
  GwraDistrictKey,
} from "../../src/lib/real/types";
import type { PdfLine, PdfPage } from "./pdfText";

export const GWRA_URL =
  "https://www.jalshakti-dowr.gov.in/static/uploads/2025/11/711d8d476bbf498cd90f8038e7371227.pdf";

/** Assumed specific yield of the Thar / Kutch aquifers, used only to express the volume gap as m/yr. */
export const SPECIFIC_YIELD = 0.05;

const TARGETS: { key: GwraDistrictKey; name: string; state: "RAJASTHAN" | "GUJARAT" }[] = [
  { key: "barmer", name: "Barmer", state: "RAJASTHAN" },
  { key: "jaisalmer", name: "Jaisalmer", state: "RAJASTHAN" },
  { key: "bikaner", name: "Bikaner", state: "RAJASTHAN" },
  { key: "jodhpur", name: "Jodhpur", state: "RAJASTHAN" },
  { key: "kachchh", name: "Kachchh", state: "GUJARAT" },
];
const targetByName = new Map(TARGETS.map((t) => [t.name.toLowerCase(), t]));

const NUM = String.raw`-?\d+(?:\.\d+)?`;

function stateOf(page: PdfPage): "RAJASTHAN" | "GUJARAT" | null {
  const raj = /\bRAJASTHAN\b/.test(page.text);
  const guj = /\bGUJARAT\b/.test(page.text);
  if (raj === guj) return null; // neither, or a multi-state national table
  return raj ? "RAJASTHAN" : "GUJARAT";
}

export function categoryFromStage(stage: number): GwCategory {
  if (stage <= 70) return "safe";
  if (stage <= 90) return "semi_critical";
  if (stage <= 100) return "critical";
  return "over_exploited";
}

function categoryFromText(s: string): GwCategory | null {
  const t = s.toLowerCase().replace(/[-\s]+/g, " ");
  if (t.includes("over exploited") || t.includes("overexploited")) return "over_exploited";
  if (t.includes("semi critical") || t.includes("semicritical")) return "semi_critical";
  if (t.includes("critical")) return "critical";
  if (t.includes("saline")) return "saline";
  if (t.includes("safe")) return "safe";
  return null;
}

/** "Jaisalmer_Rural" -> "Jaisalmer (rural)", "Gandhidham (C)" -> "Gandhidham". */
export function blockLabel(name: string): string {
  return name
    .replace(/\s*\(C\)\s*$/i, "")
    .replace(/_Rural$/i, " (rural)")
    .replace(/_Urban$/i, " (urban)")
    .replace(/_/g, " ")
    .trim();
}

/** A row "n District v1 v2 ... vk" -> numbers, if the district is one of ours. */
function districtRow(line: PdfLine, minNumbers: number): { name: string; nums: number[] } | null {
  const m = line.text.match(new RegExp(String.raw`^\d+ ([A-Za-z][A-Za-z .&()-]*?) ((?:${NUM} ?)+)$`));
  if (!m) return null;
  const name = m[1].trim();
  if (!targetByName.has(name.toLowerCase())) return null;
  const nums = m[2].trim().split(/\s+/).map(Number);
  if (nums.length < minNumbers || nums.some((x) => Number.isNaN(x))) return null;
  return { name, nums };
}

interface Column {
  x: number;
  kind: "district" | GwCategory | "fluoride" | "arsenic" | "other";
}

/**
 * Recover the columns of a "S. No | Name ..." list table: each "S. No" header item starts
 * a column; the header words between two "S. No" items name it.
 */
function listColumns(page: PdfPage): { columns: Column[]; headerY: number } | null {
  const header = page.lines.find((l) => l.items.filter((i) => /^S\.?\s*No/i.test(i.s.trim())).length >= 3);
  if (!header) return null;
  const sNo = header.items.filter((i) => /^S\.?\s*No/i.test(i.s.trim())).map((i) => i.x).sort((a, b) => a - b);
  const band = page.lines.filter((l) => Math.abs(l.y - header.y) <= 12).flatMap((l) => l.items);
  const columns: Column[] = sNo.map((x, k) => {
    const next = sNo[k + 1] ?? Infinity;
    const words = band
      .filter((i) => i.x > x + 1 && i.x < next - 1 && !/^S\.?\s*No/i.test(i.s.trim()))
      .map((i) => i.s)
      .join(" ");
    let kind: Column["kind"] = "other";
    if (/district/i.test(words)) kind = "district";
    else if (/salin/i.test(words)) kind = "saline";
    else if (/fluoride/i.test(words)) kind = "fluoride";
    else if (/arsenic/i.test(words)) kind = "arsenic";
    else kind = categoryFromText(words) ?? "other";
    return { x, kind };
  });
  return { columns, headerY: header.y };
}

const STOP = /National Compilation|CATEGORIZATION|QUALITY PROBLEMS|ABSTRACT|Number of|Total No\.|^RAJASTHAN$|^GUJARAT$/i;

/** Walk a list table; returns (district, columnKind, name) triples. `carry` keeps the district across pages. */
function walkListTable(
  page: PdfPage,
  carry: { district: string | null },
): { district: string; kind: Column["kind"]; name: string }[] {
  const cols = listColumns(page);
  if (!cols) return [];
  const out: { district: string; kind: Column["kind"]; name: string }[] = [];
  const colOf = (x: number) => {
    let c: Column | null = null;
    for (const col of cols.columns) if (col.x <= x + 3) c = col;
    return c;
  };
  for (const line of page.lines) {
    if (line.y >= cols.headerY - 6) continue; // header band
    if (STOP.test(line.text)) break;
    const byCol = new Map<Column, string[]>();
    for (const it of line.items) {
      const s = it.s.trim();
      if (!s || /^\d+$/.test(s)) continue; // serial numbers
      const c = colOf(it.x);
      if (!c) continue;
      byCol.set(c, [...(byCol.get(c) ?? []), s]);
    }
    for (const [c, parts] of byCol) {
      const text = parts.join(" ").replace(/\s+/g, " ").trim();
      if (c.kind === "district") carry.district = text;
    }
    for (const [c, parts] of byCol) {
      if (c.kind === "district" || !carry.district) continue;
      out.push({ district: carry.district, kind: c.kind, name: parts.join(" ").replace(/\s+/g, " ").trim() });
    }
  }
  return out;
}

const CAT_WORDS = "Safe|Semi Critical|Semi-Critical|Critical|Over Exploited|Over-Exploited|Saline";

export interface ParsedGwra {
  districts: Record<GwraDistrictKey, GwraDistrict>;
  blocks: GwraBlock[];
  warnings: string[];
}

export function parseGwra(pages: PdfPage[]): ParsedGwra {
  const warnings: string[] = [];
  const res = new Map<GwraDistrictKey, { nums: number[]; page: number }>();
  const area = new Map<GwraDistrictKey, { km2: number; page: number }>();
  const units = new Map<GwraDistrictKey, { n: number; page: number }>();
  const blocks = new Map<string, GwraBlock>();
  const carryCat: Record<string, { district: string | null }> = { RAJASTHAN: { district: null }, GUJARAT: { district: null } };
  const carryQual: Record<string, { district: string | null }> = { RAJASTHAN: { district: null }, GUJARAT: { district: null } };

  const blockKey = (d: GwraDistrictKey, name: string) => `${d}|${blockLabel(name).toLowerCase()}`;
  const upsert = (d: GwraDistrictKey, name: string, page: number): GwraBlock => {
    const k = blockKey(d, name);
    let b = blocks.get(k);
    if (!b) {
      b = {
        name,
        label: blockLabel(name),
        district: d,
        category: "safe",
        stagePct: null,
        previous: null,
        salinityAffected: false,
        point: null,
        page,
      };
      blocks.set(k, b);
    }
    return b;
  };

  for (const page of pages) {
    // 0) National list of Saline assessment units (multi-state table: "n State District Block").
    if (/Saline Assessment Units of India/i.test(page.text)) {
      for (const line of page.lines) {
        const m = line.text.match(/^\d+ (Rajasthan|Gujarat) (\S+(?: \S+)*?) (\S.*)$/);
        if (!m) continue;
        const tgt = targetByName.get(m[2].trim().toLowerCase());
        if (!tgt || tgt.state.toLowerCase() !== m[1].toLowerCase()) continue;
        upsert(tgt.key, m[3].trim(), page.n).category = "saline";
      }
    }

    const state = stateOf(page);
    if (!state) continue;
    const t = page.text;

    // 1) District resources table (16 columns: 14 numbers after the name).
    if (/Total Natural/i.test(t) && /Extractable/i.test(t) && /Stage of/i.test(t)) {
      for (const line of page.lines) {
        const row = districtRow(line, 14);
        if (row && row.nums.length === 14) {
          const tgt = targetByName.get(row.name.toLowerCase())!;
          if (tgt.state === state && !res.has(tgt.key)) res.set(tgt.key, { nums: row.nums, page: page.n });
        }
      }
    }

    // 2) Recharge-worthy area per category (first number = total area of assessed units, km2).
    if (/Worthy/i.test(t) && /sq\.?\s*km/i.test(t)) {
      for (const line of page.lines) {
        const row = districtRow(line, 1);
        if (!row) continue;
        const tgt = targetByName.get(row.name.toLowerCase())!;
        if (tgt.state === state && !area.has(tgt.key)) area.set(tgt.key, { km2: row.nums[0], page: page.n });
      }
    }

    // 3) Number of assessment units per category (first number = total units).
    if (/Total No\./i.test(t) && /Safe/i.test(t) && /Saline/i.test(t) && !/Worthy/i.test(t) && !/Mcm/i.test(t) && !/CATEGORIZATION/i.test(t)) {
      for (const line of page.lines) {
        const row = districtRow(line, 1);
        if (!row) continue;
        const tgt = targetByName.get(row.name.toLowerCase())!;
        if (tgt.state === state && !units.has(tgt.key)) units.set(tgt.key, { n: row.nums[0], page: page.n });
      }
    }

    // 4) Categorisation of assessment units (names in category columns).
    if (/CATEGORIZATION of ASSESSMENT UNITS, 2025/i.test(t) && !/COMPARISON/i.test(t)) {
      for (const r of walkListTable(page, carryCat[state])) {
        const tgt = targetByName.get(r.district.toLowerCase());
        if (!tgt || tgt.state !== state) continue;
        const cat = r.kind;
        if (cat === "semi_critical" || cat === "critical" || cat === "over_exploited" || cat === "saline") {
          upsert(tgt.key, r.name, page.n).category = cat;
        }
      }
    }

    // 5) Quality problems: salinity column.
    if (/QUALITY PROBLEMS IN ASSESSMENT UNITS, 2025/i.test(t)) {
      for (const r of walkListTable(page, carryQual[state])) {
        const tgt = targetByName.get(r.district.toLowerCase());
        if (!tgt || tgt.state !== state || r.kind !== "saline") continue;
        const k = blockKey(tgt.key, r.name);
        const b = blocks.get(k) ?? upsert(tgt.key, r.name, page.n);
        b.salinityAffected = true;
      }
    }

    // 6) Category changes 2024 -> 2025 (rows print the stage % for both years).
    if (/COMPARISON OF CATEGORIZATION/i.test(t)) {
      const re = new RegExp(
        String.raw`^\d+ (.+?) (.+?) (${NUM}) (${CAT_WORDS}) \1 \2 (${NUM}) (${CAT_WORDS})(?: (Improved|Deteriorated))?$`,
        "i",
      );
      for (const line of page.lines) {
        const m = line.text.match(re);
        if (!m) continue;
        const tgt = targetByName.get(m[1].trim().toLowerCase());
        if (!tgt || tgt.state !== state) continue;
        const b = upsert(tgt.key, m[2].trim(), page.n);
        b.stagePct = Number(m[5]);
        b.category = categoryFromText(m[6]) ?? b.category;
        b.previous = { category: categoryFromText(m[4]) ?? "safe", stagePct: Number(m[3]) };
      }
    }
  }

  const districts = {} as Record<GwraDistrictKey, GwraDistrict>;
  for (const tgt of TARGETS) {
    const r = res.get(tgt.key);
    if (!r) throw new Error(`GWRA 2025: district resources row for ${tgt.name} not found`);
    // Columns 3..16 of the printed table.
    const [monRain, monOther, nonRain, nonOther, recharge, natural, extractable, irr, ind, dom, total, , , stage] = r.nums;
    const sum = monRain + monOther + nonRain + nonOther;
    if (Math.abs(sum - recharge) > 1) warnings.push(`${tgt.name}: recharge parts ${sum.toFixed(2)} != total ${recharge}`);
    if (Math.abs((100 * total) / extractable - stage) > 0.2) {
      warnings.push(`${tgt.name}: stage ${stage}% does not match ${((100 * total) / extractable).toFixed(2)}%`);
    }
    const a = area.get(tgt.key) ?? null;
    const u = units.get(tgt.key) ?? null;
    if (!a) warnings.push(`${tgt.name}: recharge-worthy area not found`);
    const gap = total - extractable;
    const decline = a && gap > 0 ? gap / (a.km2 * 100 * SPECIFIC_YIELD) : 0;
    districts[tgt.key] = {
      key: tgt.key,
      name: tgt.name,
      state: tgt.state === "RAJASTHAN" ? "Rajasthan" : "Gujarat",
      rechargeHam: recharge,
      naturalDischargeHam: natural,
      extractableHam: extractable,
      extraction: { irrigationHam: irr, industrialHam: ind, domesticHam: dom, totalHam: total },
      stagePct: stage,
      stageCategory: categoryFromStage(stage),
      rechargeAreaKm2: a?.km2 ?? null,
      unitsTotal: u?.n ?? null,
      gapHam: Math.round(gap * 100) / 100,
      impliedDeclineMPerYr: Math.round(decline * 1000) / 1000,
      pages: { resources: r.page, area: a?.page ?? null, units: u?.page ?? null },
    };
  }

  return { districts, blocks: [...blocks.values()], warnings };
}
