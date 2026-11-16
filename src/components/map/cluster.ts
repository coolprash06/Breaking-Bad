/**
 * Marker clustering for the flat map. Pure (no React) so it can be tested.
 * A cluster always shows its MOST URGENT member, whatever is selected:
 * a Safe source must never hide a Warning next to it.
 */
import type { DisplayTier } from "@/lib/alerts/tiers";

/** Lower = more urgent. Grey (no data) ranks above Watch: we cannot vouch for it. */
export const SEVERITY: Record<DisplayTier, number> = { emergency: 0, warning: 1, nodata: 2, watch: 3, safe: 4 };

export interface ClusterItem {
  id: string;
  /** Position in projected (zoom 1) pixels. */
  x: number;
  y: number;
  tier: DisplayTier;
}

export interface ClusterGroup {
  ids: string[];
  x: number;
  y: number;
  /** The most urgent member: its tier is the icon the cluster shows. */
  leadId: string;
}

/** Most urgent item; ties keep the earlier one. */
export function mostUrgent<T extends { tier: DisplayTier }>(items: T[]): T {
  return items.reduce((best, it) => (SEVERITY[it.tier] < SEVERITY[best.tier] ? it : best));
}

/**
 * Greedy clustering: take items in the given order (callers put the selected source
 * and relevant sources first so they seed clusters) and absorb every unused item
 * within `radius`.
 */
export function clusterMarkers(ordered: ClusterItem[], radius: number): ClusterGroup[] {
  const used = new Set<string>();
  const out: ClusterGroup[] = [];
  for (const seed of ordered) {
    if (used.has(seed.id)) continue;
    const members = ordered.filter((o) => !used.has(o.id) && Math.hypot(o.x - seed.x, o.y - seed.y) < radius);
    members.forEach((m) => used.add(m.id));
    out.push({
      ids: members.map((m) => m.id),
      x: members.reduce((a, m) => a + m.x, 0) / members.length,
      y: members.reduce((a, m) => a + m.y, 0) / members.length,
      leadId: mostUrgent(members).id,
    });
  }
  return out;
}
