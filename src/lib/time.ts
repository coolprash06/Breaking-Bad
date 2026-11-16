/** Date helpers on ISO calendar dates (YYYY-MM-DD), always in UTC. */

const MS_PER_DAY = 86_400_000;

export function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUtcMs(toUtcMs(iso) + n * MS_PER_DAY);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
}

/** 1-12 */
export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}

/** 1-366 */
export function dayOfYear(iso: string): number {
  const y = iso.slice(0, 4);
  return daysBetween(`${y}-01-01`, iso) + 1;
}

export function formatShort(iso: string): string {
  const d = new Date(toUtcMs(iso));
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
