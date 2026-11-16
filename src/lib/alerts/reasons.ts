/** Plain-language reasons behind a status ("No rain for 60 days, usage up 30%"). */
import type { MonsoonSummary, UsageCategory } from "@/lib/types";
import { formatShort } from "@/lib/time";
import type { Signals } from "./signals";
import { SIGNAL_RULES } from "./signals";

const USAGE_LABEL: Record<UsageCategory, string> = {
  fetch: "Household / tanker drawing",
  spot: "Livestock and on-spot use",
  pump: "Farm pumping",
};

/** Very short SMS forms of a reason, English (GSM-7 only) and simple Hindi. */
export interface ReasonSms {
  en: string;
  hi: string;
}

export interface Reason {
  kind: "rain" | "usage" | "level" | "vegetation" | "data" | "heat";
  text: string;
  /** Short form for SMS. Data-quality reasons have none (they are not a cause). */
  sms?: ReasonSms;
}

/** A monsoon this far below normal is worth stating as context (%). */
export const MONSOON_DEFICIT_PCT = 15;

const USAGE_SMS: Record<UsageCategory, { en: string; hi: string; hiUp: string }> = {
  fetch: { en: "Water drawing", hi: "पानी भरना", hiUp: "बढ़ा" },
  spot: { en: "Animal use", hi: "पशुओं का पानी", hiUp: "बढ़ा" },
  pump: { en: "Pumping", hi: "पंपिंग", hiUp: "बढ़ी" },
};

export function buildReasons(args: {
  signals: Signals;
  daysSinceReading: number;
  startKind: "sensor" | "manual" | "none";
  startDate: string | null;
  bandWidening: number;
  petRecent: number;
  /** Last monsoon vs its long-term normal at this source (REAL climate only). */
  monsoon?: MonsoonSummary | null;
}): Reason[] {
  const { signals: s } = args;
  const out: Reason[] = [];

  if (s.rain.on) out.push({
      kind: "rain",
      text: `No rain for ${s.rain.daysSinceRain} days`,
      sms: { en: `No rain for ${s.rain.daysSinceRain} days.`, hi: `${s.rain.daysSinceRain} दिन से बारिश नहीं।` },
    });

  // Context, not a trigger: a weak monsoon means less stored water going into the dry season.
  const m = args.monsoon;
  if (m && m.departurePct <= -MONSOON_DEFICIT_PCT) {
    out.push({ kind: "rain", text: `Monsoon ${m.year} was ${-m.departurePct}% below normal (${m.actualMm} vs ${m.normalMm} mm)` });
  }

  for (const u of s.usageChanges) {
    if (u.change === null && u.recent > 0.05) {
      const unit = u.category === "pump" ? " pump-hours/day" : "";
      const m = USAGE_SMS[u.category];
      out.push({
        kind: "usage",
        text: `${USAGE_LABEL[u.category]} restarted (${u.recent.toFixed(1)}${unit})`,
        sms: { en: `${m.en} has restarted.`, hi: `${m.hi} फिर शुरू हुआ।` },
      });
    } else if (u.change !== null && u.change >= SIGNAL_RULES.usageUpFactor - 1) {
      const m = USAGE_SMS[u.category];
      const pct = Math.round(u.change * 100);
      out.push({
        kind: "usage",
        text: `${USAGE_LABEL[u.category]} up ${pct}%`,
        sms: { en: `${m.en} up ${pct}%.`, hi: `${m.hi} ${pct}% ${m.hiUp}।` },
      });
    }
  }

  if (s.level.recentSlope !== null && s.level.on) {
    const cm = Math.abs(s.level.recentSlope * 100).toFixed(1);
    if (s.level.fast && s.level.usualSlope < 0) {
      const x = s.level.recentSlope / s.level.usualSlope;
      out.push({
        kind: "level",
        text: `Level falling ${cm} cm/day, ${x.toFixed(1)}x faster than usual`,
        sms: { en: `Falling ${x.toFixed(1)}x faster than usual.`, hi: `पानी आम से ${x.toFixed(1)} गुना तेज़ घट रहा है।` },
      });
    } else {
      out.push({
        kind: "level",
        text: `Level falling ${cm} cm/day`,
        sms: { en: `Level falling ${cm} cm a day.`, hi: `पानी रोज़ ${cm} सेमी घट रहा है।` },
      });
    }
  }

  if (s.ndvi.on && s.ndvi.change30 !== null && s.ndvi.change30 < 0) {
    out.push({
      kind: "vegetation",
      text: `Vegetation browning nearby (NDVI ${s.ndvi.change30.toFixed(2)} in 30 days)`,
      sms: { en: "Plants nearby are drying.", hi: "आसपास की हरियाली सूख रही है।" },
    });
  }
  if (s.ndvi.skippedCloudy > 0 && s.ndvi.latestDate) {
    out.push({
      kind: "data",
      text: `Satellite: ${s.ndvi.skippedCloudy} cloudy image${s.ndvi.skippedCloudy > 1 ? "s" : ""} skipped, using last good value from ${formatShort(s.ndvi.latestDate)}`,
    });
  }

  if (args.petRecent >= 6) out.push({ kind: "heat", text: "High heat: evaporation is fast", sms: { en: "Strong heat.", hi: "तेज़ गर्मी है।" } });

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
