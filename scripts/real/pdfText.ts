/**
 * Minimal positioned-text reader for tabular government PDFs (pdfjs-dist).
 * Groups text items into lines by their y coordinate, keeping each item's x,
 * so table columns can be recovered from header positions.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface TextItem {
  s: string;
  x: number;
  y: number;
}

export interface PdfLine {
  y: number;
  items: TextItem[];
  /** Items joined left to right with single spaces. */
  text: string;
}

export interface PdfPage {
  /** 1-based page number in the PDF. */
  n: number;
  lines: PdfLine[];
  /** Whole page text, lines top to bottom. */
  text: string;
}

const Y_TOLERANCE = 2.5;

export function toLines(items: TextItem[]): PdfLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= Y_TOLERANCE) last.items.push(it);
    else lines.push({ y: it.y, items: [it], text: "" });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.s.trim()).join(" ").replace(/\s+/g, " ").trim();
  }
  return lines;
}

export async function readPdf(data: Uint8Array): Promise<PdfPage[]> {
  const doc = await getDocument({ data, verbosity: 0, useSystemFonts: false }).promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      if (!raw.str || !raw.str.trim() || !raw.transform) continue;
      items.push({ s: raw.str, x: raw.transform[4], y: raw.transform[5] });
    }
    const lines = toLines(items);
    pages.push({ n, lines, text: lines.map((l) => l.text).join("\n") });
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}
