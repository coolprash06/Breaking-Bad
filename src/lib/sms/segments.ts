/**
 * SMS length rules (3GPP TS 23.038 / 23.040), used by the simulated phone and by
 * the message templates to stay within 1-2 segments.
 *
 *  GSM-7 (plain English):   160 chars in one SMS; 153 per part when split.
 *  UCS-2 (Hindi, any char outside GSM-7): 70 in one SMS; 67 per part when split.
 * A single non-GSM character (e.g. an en dash) switches the whole message to UCS-2.
 */

// GSM 03.38 default alphabet (escape character 0x1B excluded).
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** Extension table: each costs 2 septets (escape + char). */
const GSM_EXT = "^{}\\[~]|€\f";

const BASIC = new Set(GSM_BASIC);
const EXT = new Set(GSM_EXT);

export type SmsEncoding = "GSM-7" | "UCS-2";

export interface SmsInfo {
  encoding: SmsEncoding;
  /** Characters as the user sees them (code points). */
  chars: number;
  /** Units counted against the limit: septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number;
  segments: number;
  /** Units allowed per segment at this length (160/153 or 70/67). */
  perSegment: number;
  /** Units left before the next segment starts. */
  remaining: number;
}

export function isGsm7(text: string): boolean {
  for (const ch of text) if (!BASIC.has(ch) && !EXT.has(ch)) return false;
  return true;
}

export function smsInfo(text: string): SmsInfo {
  const chars = [...text].length;
  if (isGsm7(text)) {
    let units = 0;
    for (const ch of text) units += EXT.has(ch) ? 2 : 1;
    return pack("GSM-7", chars, units, 160, 153);
  }
  // UCS-2 counts UTF-16 code units (Devanagari is in the BMP: 1 unit per char).
  return pack("UCS-2", chars, text.length, 70, 67);
}

function pack(encoding: SmsEncoding, chars: number, units: number, single: number, multi: number): SmsInfo {
  if (units <= single) {
    return { encoding, chars, units, segments: units === 0 ? 0 : 1, perSegment: single, remaining: single - units };
  }
  const segments = Math.ceil(units / multi);
  return { encoding, chars, units, segments, perSegment: multi, remaining: segments * multi - units };
}

/** The most units that still fit in `maxSegments` (306 GSM-7 / 134 UCS-2 for 2). */
export function maxUnits(encoding: SmsEncoding, maxSegments: number): number {
  if (maxSegments <= 1) return encoding === "GSM-7" ? 160 : 70;
  return maxSegments * (encoding === "GSM-7" ? 153 : 67);
}
