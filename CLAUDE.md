@AGENTS.md

# WellCast: project context

Breaking Bytes Hackathon, Track 2 (Water & Climate AI). AI early-warning for water sources in the Thar Desert (Rajasthan) and Kutch (Gujarat): forecast when each source will fail, with a confidence range, and warn each persona category weeks ahead.
Deadline: **17 Nov 2026, 12:00 PM**. Full requirements: `prd.txt`. Real vs simulated data and model notes: `JUDGES_NOTES.md`.

## Hackathon rules (strict)
- 99.1% original code. Never copy, fork or adapt code from GitHub repos, templates or starters. Standard npm packages are fine; public *data* (e.g. DataMeet boundaries) is fine with credit.
- Everything is built inside the 24-hour window. The login page is a separate Vite project: match its style, never copy its code.
- **Never commit.** At the end of each phase, stop and remind the user to commit. They use Windows PowerShell: give git commands one per line, no `&&`.
- No secrets in code. Use `.env.local` (gitignored); `.env.example` has names only.

## Stack
Next.js 16.4 (App Router; read `node_modules/next/dist/docs/` before using Next APIs), React 19.3, TypeScript, Tailwind 4, Recharts, Vitest, tsx, Twilio SDK. Leaflet is installed but Phase 3 replaces third-party tiles (see Design).

## Architecture
- One data layer, one forecast engine, four "lenses" (purpose tabs). Tabs change highlighting, panel content and message style only.
- `src/lib/sim/`: seeded generator (seed 20261116) -> `data/simulated/*.json` (`npm run generate`). `_truth.json` is hidden ground truth, read only by tests.
- `src/lib/data/store.ts`: every dataset travels in a `Dataset<T>` with `provenance: "REAL" | "SIMULATED"`. Real data drops into `data/real/`.
- `src/lib/forecast/`: weighted ridge regression with sign constraints learns per-source parameters; 500-run Monte Carlo ensemble gives P10-P90 band and time-to-failure.
- `src/lib/alerts/`: tiers (safe/watch/warning/emergency + nodata), 2-of-3 signal agreement, 3-day persistence, reasons.
- API: `/api/sources`, `/api/forecast/[id]`, `/api/alerts`. Routes: `/`, `/login` (placeholder + Try demo), `/panchayat`, `/dev/data`.
- Demo timeline: start 2025-11-17, demo "today" 2026-11-16, end 2027-01-11. Locations are illustrative.

## Status
- Done: Phase 0 (scaffold), Phase 1 (simulated data + data layer), Phase 2 (learned forecast + alert engine).
- Next: Phase 3 main screen (header + batch clock, 4 purpose tabs, persona panel, globe/map, source readout, provenance footer). Then Phases 4-5 (warnings/SMS, Panchayat, polish, judges' notes).
- Design system for Phase 3: preview pending approval (see below).

## Design (Phase 3, pending approval)
- Mood matches the login page: purple-black/maroon base, neon lab-green glow (highlights only), dusk amber accent, sand/cream text. Light mode = "desert daylight". Theme: system default, toggle in header, saved in localStorage (try/catch).
- Fonts via next/font: Bebas Neue (display), JetBrains Mono (labels + all numbers), Inter (body), Noto Sans Devanagari (Hindi).
- Risk colours are fixed and never the theme green: Safe teal-cyan circle ✓, Watch yellow triangle !, Warning orange diamond !, Emergency red octagon ✕, No data grey dashed circle ?. Confidence = opacity / dashed ring + printed label ("~5 wk · 70%").
- Map: official Survey of India boundary (DataMeet `india-soi.geojson` + state boundaries), simplified with mapshaper. No OSM/CARTO tiles. Globe (react-three-fiber, lazy, capped DPR, idle pause, 2D fallback) + flat MAP view; control box: GLOBE|MAP top-left, ZOOM IN/OUT/RESET bottom-right.
- Themed labels always carry the plain meaning: "LAB READOUT · Source details". Warnings and numbers stay plain.
