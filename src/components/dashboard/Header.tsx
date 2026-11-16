"use client";

import Link from "next/link";
import { setTheme, useThemeKey } from "@/components/theme/useThemeKey";
import { addDays, daysBetween } from "@/lib/time";

function Tile({ n, sym, mass, tone }: { n: number; sym: string; mass: string; tone: "lab" | "amber" }) {
  const lab = tone === "lab";
  return (
    <div
      className="relative grid h-[42px] w-[38px] place-items-center rounded-[3px] border-[1.5px] font-display text-[26px] leading-none"
      style={{
        borderColor: lab ? "var(--lab)" : "var(--amber)",
        color: lab ? "var(--lab)" : "var(--amber)",
        background: lab ? "color-mix(in srgb, var(--lab) 9%, transparent)" : "var(--amber-soft)",
        textShadow: lab ? "0 0 12px var(--lab-glow)" : "none",
      }}
    >
      <i className="absolute top-0.5 left-1 font-mono text-[8px] font-semibold not-italic text-muted" style={{ textShadow: "none" }}>
        {n}
      </i>
      {sym}
      <b className="absolute right-[3px] bottom-0.5 font-mono text-[7px] font-normal text-faint" style={{ textShadow: "none" }}>
        {mass}
      </b>
    </div>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-[3px]" aria-hidden>
        <Tile n={74} sym="W" mass="183.84" tone="lab" />
        <Tile n={20} sym="Ca" mass="40.078" tone="amber" />
      </div>
      <div>
        <h1 className="font-display text-[34px] leading-[0.9] tracking-[0.04em]">
          WELL<span className="wc-glow">CAST</span>
        </h1>
        <p className="hidden font-mono text-[11px] tracking-[0.06em] text-muted sm:block">A weather forecast for wells · Thar + Kutch</p>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const theme = useThemeKey();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="wc-btn grid h-[34px] w-[34px] place-items-center rounded-full! p-0!"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next === "light" ? "daylight" : "dark"} mode`}
      title={`Switch to ${next === "light" ? "daylight" : "dark"} mode`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        {theme === "dark" ? (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        ) : (
          <path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
        )}
      </svg>
    </button>
  );
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

interface ClockProps {
  asOf: string;
  demoDate: string;
  end: string;
  busy: boolean;
  onChange(iso: string): void;
}

function BatchClock({ asOf, demoDate, end, busy, onChange }: ClockProps) {
  const left = daysBetween(asOf, end);
  const step = (n: number) => onChange(addDays(asOf, Math.min(n, left)));
  const offset = daysBetween(demoDate, asOf);
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="wc-label">
        Batch clock <em>· Demo time</em>
      </div>
      <div className="font-mono text-[15px] font-medium tracking-[0.06em] tabular-nums" aria-live="polite">
        {fmtDate(asOf)}
        {offset > 0 && <span className="ml-1.5 text-[11px] text-amber">+{offset} d</span>}
      </div>
      <button className="wc-btn" disabled={busy || left <= 0} onClick={() => step(1)}>
        +1 day
      </button>
      <button className="wc-btn" disabled={busy || left <= 0} onClick={() => step(7)}>
        +7 days
      </button>
      <button className="wc-btn" disabled={busy || offset === 0} onClick={() => onChange(demoDate)}>
        Reset
      </button>
      {busy && <span className="font-mono text-[11px] text-muted">Calibrating forecast…</span>}
    </div>
  );
}

export default function Header(props: ClockProps) {
  return (
    <header
      className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border px-4 py-3.5 sm:px-5"
      style={{ background: "color-mix(in srgb, var(--panel) 85%, transparent)" }}
    >
      <div className="mr-auto">
        <Logo />
      </div>
      <BatchClock {...props} />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Link href="/login" className="wc-btn wc-btn-primary">
          Panchayat login
        </Link>
      </div>
    </header>
  );
}
