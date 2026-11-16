import type { WaterBodyPoint } from "./types";

/**
 * Dust and haze are not always in the cloud mask and make water look like land. A clear
 * reading below half the median of its 3 clear neighbours on each side is flagged and not used
 * (same idea as the sensor-glitch filter).
 */
export function flagHaze(series: WaterBodyPoint[]): WaterBodyPoint[] {
  const clearIdx = series.map((p, i) => (p.areaHa !== null ? i : -1)).filter((i) => i >= 0);
  const out = series.map((p) => ({ ...p }));
  clearIdx.forEach((idx, j) => {
    const nb = [...clearIdx.slice(Math.max(0, j - 3), j), ...clearIdx.slice(j + 1, j + 4)].map((i) => series[i].areaHa as number);
    if (nb.length < 3) return;
    const sorted = [...nb].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const v = series[idx].areaHa as number;
    if (med > 0.5 && v < 0.5 * med) out[idx] = { date: series[idx].date, areaHa: null, cloudy: false, haze: v };
  });
  return out;
}
