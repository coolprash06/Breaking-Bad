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
Next.js 16.4 (App Router; read `node_modules/next/dist/docs/` before using Next APIs), React 19.3, TypeScript, Tailwind 4, Recharts, Vitest, tsx, Twilio SDK. three.js + React Three Fiber (globe), d3-geo (projections). Leaflet removed: no third-party tiles.

## Architecture
- One data layer, one forecast engine, four "lenses" (purpose tabs). Tabs change highlighting, panel content and message style only.
- `src/lib/sim/`: seeded generator (seed 20261116) -> `data/simulated/*.json` (`npm run generate`). `_truth.json` is hidden ground truth, read only by tests.
- `src/lib/data/store.ts`: every dataset travels in a `Dataset<T>` with `provenance: "REAL" | "SIMULATED"`. Real data drops into `data/real/`.
- `src/lib/forecast/`: weighted ridge regression with sign constraints learns per-source parameters; 500-run Monte Carlo ensemble gives P10-P90 band and time-to-failure.
- `src/lib/alerts/`: tiers (safe/watch/warning/emergency + nodata), 2-of-3 signal agreement, 3-day persistence, reasons.
- API: `/api/sources`, `/api/forecast/[id]`, `/api/alerts`. Routes: `/`, `/login` (placeholder + Try demo), `/panchayat`, `/dev/data`.
- Demo timeline: start 2025-11-17, demo "today" 2026-11-16, end 2027-01-11. Locations are illustrative.

## Status
- Done: Phase 0 (scaffold), Phase 1 (simulated data + data layer), Phase 2 (learned forecast + alert engine), Phase 3 (main screen: `src/components/dashboard/*`, `src/components/map/*`; persona warnings + nearest safe source in `src/lib/alerts/warnings.ts`, `nearest.ts`).
- Next: Phase 4 (SMS via Twilio + simulated phone screen, reusing `personaWarning`), Phase 5 (Panchayat actions/escalation, polish, judges' notes).

## Design system v2 (approved 16 Nov 2026)
- Mood matches the login page: purple-black/maroon base, neon lab-green glow (highlights only), dusk amber accent, sand/cream text. Light mode = "desert daylight". Theme: system default, toggle in header, saved in localStorage (try/catch).
- Fonts via next/font: Bebas Neue (display), JetBrains Mono (labels + all numbers), Inter (body), Noto Sans Devanagari (Hindi).
- Risk colours are fixed and never the theme green: Safe teal-cyan circle ✓, Watch yellow triangle !, Warning orange diamond !, Emergency red octagon ✕, No data grey dashed circle ?. Confidence = opacity / dashed ring + printed label ("~5 wk · 70%").
- Map: `public/geo/*` (DataMeet SoI outline CC BY-SA 2.5/ODbL, SoI state lines CC BY 4.0, Natural Earth land); provenance in `public/geo/README.md`. No OSM/CARTO tiles. Globe (R3F, lazy, DPR <= 1.5, frameloop demand, slow-frame/WebGL-loss fallback to 2D) + flat MAP (SVG, d3-geo). Control box: GLOBE|MAP top-left, ZOOM IN/OUT/RESET bottom-right.
- Navigation: globe zoom capped; past the cap / on clicking India or a source it flies on and hands off to the map (one continuous move). Map pan/zoom writes the DOM via refs (no React render per frame), zooms toward pointer/selected source, clusters close markers.
- Data: 28 simulated sources; #19-#28 are Safe alternatives. Stepwell #6 (TH-06) is deliberately the one source with no suitable alternative.
- Nearest safe source: haversine; herders only animal-capable, households only drinkable public types; honest "none within X km" message.
- Themed labels always carry the plain meaning: "LAB READOUT · Source details". Warnings and numbers stay plain.
