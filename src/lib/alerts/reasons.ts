/** Plain-language reasons behind a status ("No rain for 60 days, usage up 30%"). */
import type { UsageCategory } from "@/lib/types";
import { formatShort } from "@/lib/time";
import type { Signals } from "./signals";
import { SIGNAL_RULES } from "./signals";

const USAGE_LABEL: Record<UsageCategory, string> = {
  fetch: "Household / tanker drawing",
  spot: "Livestock and on-spot use",
  pump: "Farm pumping",
};

export interface Reason {
  kind: "rain" | "usage" | "level" | "vegetation" | "data" | "heat";
  text: string;
}

export function buildReasons(args: {
  signals: Signals;
  daysSinceReading: number;
  startKind: "sensor" | "manual" | "none";
  startDate: string | null;
  bandWidening: number;
  petRecent: number;
}): Reason[] {
  const { signals: s } = args;
  const out: Reason[] = [];

  if (s.rain.on) out.push({ kind: "rain", text: `No rain for ${s.rain.daysSinceRain} days` });

  for (const u of s.usageChanges) {
    if (u.change === null && u.recent > 0.05) {
      const unit = u.category === "pump" ? " pump-hours/day" : "";
      out.push({ kind: "usage", text: `${USAGE_LABEL[u.category]} restarted (${u.recent.toFixed(1)}${unit})` });
    } else if (u.change !== null && u.change >= SIGNAL_RULES.usageUpFactor - 1) {
      out.push({ kind: "usage", text: `${USAGE_LABEL[u.category]} up ${Math.round(u.change * 100)}%` });
    }
  }

  if (s.level.recentSlope !== null && s.level.on) {
    const cm = Math.abs(s.level.recentSlope * 100).toFixed(1);
    if (s.level.fast && s.level.usualSlope < 0) {
      const x = s.level.recentSlope / s.level.usualSlope;
      out.push({ kind: "level", text: `Level falling ${cm} cm/day, ${x.toFixed(1)}x faster than usual` });
    } else {
      out.push({ kind: "level", text: `Level falling ${cm} cm/day` });
    }
  }

  if (s.ndvi.on && s.ndvi.change30 !== null && s.ndvi.change30 < 0) {
    out.push({ kind: "vegetation", text: `Vegetation browning nearby (NDVI ${s.ndvi.change30.toFixed(2)} in 30 days)` });
  }
  if (s.ndvi.skippedCloudy > 0 && s.ndvi.latestDate) {
    out.push({
      kind: "data",
      text: `Satellite: ${s.ndvi.skippedCloudy} cloudy image${s.ndvi.skippedCloudy > 1 ? "s" : ""} skipped, using last good value from ${formatShort(s.ndvi.latestDate)}`,
    });
  }

  if (args.petRecent >= 6) out.push({ kind: "heat", text: "High heat: evaporation is fast" });

  if (args.startKind === "manual" && args.startDate) {
    out.push({
      kind: "data",
      text: `Sensor silent for ${args.daysSinceReading}+ days: starting from manual measurement on ${formatShort(args.startDate)}, range widened`,
    });
  } else if (args.daysSinceReading > 1) {
    out.push({
      kind: "data",
      text: `No sensor reading for ${args.daysSinceReading} days: forecast range widened ${args.bandWidening.toFixed(1)}x`,
    });
  }
  return out;
}
