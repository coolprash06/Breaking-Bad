"use client";

import { PURPOSE_TABS } from "@/config/personas";
import type { PersonaCategory } from "@/lib/types";

export default function PurposeTabs({ value, onChange }: { value: PersonaCategory; onChange(v: PersonaCategory): void }) {
  return (
    <nav
      className="flex overflow-x-auto border-b border-border"
      style={{ background: "color-mix(in srgb, var(--panel2) 60%, transparent)" }}
      role="tablist"
      aria-label="Purpose"
    >
      {PURPOSE_TABS.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className="grid flex-[1_0_auto] cursor-pointer gap-0.5 border-b-2 px-3 py-2.5 text-left sm:px-[18px] sm:py-3"
            style={{
              borderBottomColor: on ? "var(--lab)" : "transparent",
              background: on ? "linear-gradient(to top, color-mix(in srgb, var(--lab) 10%, transparent), transparent)" : undefined,
            }}
          >
            <span className={`font-display text-[19px] leading-none tracking-[0.05em] sm:text-[22px] ${on ? "wc-glow" : ""}`}>{t.title}</span>
            <span className="font-mono text-[11px] text-muted">{t.subtitle}</span>
          </button>
        );
      })}
    </nav>
  );
}
