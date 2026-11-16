import type { DisplayTier } from "@/lib/alerts/tiers";

export const RISK_ORDER: DisplayTier[] = ["safe", "watch", "warning", "emergency", "nodata"];

export const RISK_UI: Record<DisplayTier, { label: string; meaning: string; color: string }> = {
  safe: { label: "Safe", meaning: "No failure expected soon", color: "var(--risk-safe)" },
  watch: { label: "Watch", meaning: "Dropping faster than usual", color: "var(--risk-watch)" },
  warning: { label: "Warning", meaning: "Likely to fail in weeks", color: "var(--risk-warning)" },
  emergency: { label: "Emergency", meaning: "Act now", color: "var(--risk-emergency)" },
  nodata: { label: "No data", meaning: "Sensor silent for 7+ days", color: "var(--risk-nodata)" },
};

/** Confidence below this draws a dashed ring around the marker. */
export const LOW_CONFIDENCE = 0.6;

const octagon = (s: number) =>
  Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    return `${(Math.cos(a) * s * 1.08).toFixed(2)} ${(Math.sin(a) * s * 1.08).toFixed(2)}`;
  }).join("L");

/**
 * Shape + glyph per tier (colour is never the only cue). Drawn centred on 0,0.
 * Confidence changes opacity and the dashed ring, never the colour.
 */
export function RiskShape({ tier, confidence = 1, size = 8 }: { tier: DisplayTier; confidence?: number; size?: number }) {
  const s = size;
  const fill = RISK_UI[tier].color;
  const ink = "var(--mark-ink)";
  const g = s * 0.55;

  if (tier === "nodata") {
    return (
      <g>
        <circle r={s} fill="var(--sea)" fillOpacity={0.75} stroke={fill} strokeWidth={s * 0.22} strokeDasharray={`${s * 0.5} ${s * 0.35}`} />
        <text y={s * 0.42} textAnchor="middle" fontFamily="var(--font-mono)" fontWeight={700} fontSize={s * 1.2} fill={fill}>
          ?
        </text>
      </g>
    );
  }

  let shape;
  if (tier === "safe") shape = <circle r={s} />;
  else if (tier === "watch") shape = <path d={`M0 ${-s * 1.15}L${s * 1.1} ${s * 0.85}L${-s * 1.1} ${s * 0.85}Z`} strokeLinejoin="round" />;
  else if (tier === "warning") shape = <path d={`M0 ${-s * 1.2}L${s * 1.2} 0L0 ${s * 1.2}L${-s * 1.2} 0Z`} strokeLinejoin="round" />;
  else shape = <path d={`M${octagon(s)}Z`} />;

  let glyph;
  if (tier === "safe") {
    glyph = (
      <path d={`M${-g * 0.7} 0L${-g * 0.15} ${g * 0.55}L${g * 0.75} ${-g * 0.5}`} fill="none" stroke={ink} strokeWidth={s * 0.24} strokeLinecap="round" strokeLinejoin="round" />
    );
  } else if (tier === "emergency") {
    glyph = <path d={`M${-g * 0.6} ${-g * 0.6}L${g * 0.6} ${g * 0.6}M${g * 0.6} ${-g * 0.6}L${-g * 0.6} ${g * 0.6}`} stroke={ink} strokeWidth={s * 0.24} strokeLinecap="round" />;
  } else {
    glyph = (
      <text y={(tier === "watch" ? s * 0.18 : 0) + s * 0.42} textAnchor="middle" fontFamily="var(--font-mono)" fontWeight={700} fontSize={s * 1.2} fill={ink}>
        !
      </text>
    );
  }

  return (
    <g>
      {confidence < LOW_CONFIDENCE && (
        <circle r={s * 1.65} fill="none" stroke={fill} strokeWidth={1.3} strokeDasharray="3 3" opacity={0.9} />
      )}
      <g fill={fill} fillOpacity={0.45 + 0.55 * confidence} stroke="var(--mark-ring)" strokeWidth={1.2}>
        {shape}
      </g>
      {glyph}
    </g>
  );
}

/** Standalone icon (legend, pills). */
export function RiskIcon({ tier, size = 16, confidence = 1 }: { tier: DisplayTier; size?: number; confidence?: number }) {
  const s = size * 0.36;
  const half = size / 2 + (confidence < LOW_CONFIDENCE ? s * 0.7 : 0);
  return (
    <svg width={half * 2} height={half * 2} viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`} aria-hidden>
      <RiskShape tier={tier} size={s} confidence={confidence} />
    </svg>
  );
}

export function RiskPill({ tier }: { tier: DisplayTier }) {
  const ui = RISK_UI[tier];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
      style={{ color: ui.color, borderColor: ui.color }}
    >
      <RiskIcon tier={tier} size={16} />
      {ui.label}
    </span>
  );
}

/** "~2 wk · 70%", "17+ wk · 98%", "silent 9 d" */
export function shortConfidence(st: {
  tier: DisplayTier;
  confidence: number;
  windowLabel: string;
  lastReading: { daysAgo: number } | null;
}): string {
  const pct = `${Math.round(st.confidence * 100)}%`;
  if (st.tier === "nodata") return st.lastReading ? `silent ${st.lastReading.daysAgo} d` : "no readings";
  const m = st.windowLabel.match(/(\d+)-(\d+) weeks/);
  if (m) return `~${Math.round((+m[1] + +m[2]) / 2)} wk · ${pct}`;
  const n = st.windowLabel.match(/within (\d+) weeks/);
  return `${n ? n[1] : "17"}+ wk · ${pct}`;
}
