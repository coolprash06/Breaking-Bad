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
Next.js 16.4 (App Router; read `node_modules/next/dist/docs/` before using Next APIs), React 19.3, TypeScript, Tailwind 4, Recharts, Vitest, tsx. three.js + React Three Fiber (globe), d3-geo (projections). Leaflet removed: no third-party tiles.

## Architecture
- One data layer, one forecast engine, four "lenses" (purpose tabs). Tabs change highlighting, panel content and message style only.
- `src/lib/sim/`: seeded generator (seed 20261116) -> `data/simulated/*.json` (`npm run generate`). `_truth.json` is hidden ground truth, read only by tests.
- `src/lib/data/store.ts`: every dataset travels in a `Dataset<T>` with `provenance: "REAL" | "SIMULATED"`. Real data drops into `data/real/`.
- `src/lib/forecast/`: weighted ridge regression with sign constraints learns per-source parameters; 500-run Monte Carlo ensemble gives P10-P90 band and time-to-failure.
- `src/lib/alerts/`: tiers (safe/watch/warning/emergency + nodata), 2-of-3 signal agreement, 3-day persistence, reasons (each with a short EN/HI `sms` form). `nearest.ts` (haversine, suitability per need), `warnings.ts` (persona templates EN + HI, fitted to 2 SMS), `dispatch.ts` (escalation-only, dedupe `sourceId|tier`).
- `src/lib/sms/segments.ts`: GSM-7 160/153 vs UCS-2 70/67 segment counter.
- API: `/api/sources`, `/api/forecast/[id]` (`cut_pump=0.3` scenario), `/api/alerts`, `POST /api/dispatch {asOf, sent}` (stateless; client keeps sent keys). Routes: `/`, `/login` (placeholder + Try demo), `/panchayat`, `/dev/data`.
- Main screen (`src/components/`): `dashboard/` (Header + batch clock, PurposeTabs, PersonaPanel, SourceReadout "lab readout", DispatchLog, ProvenanceFooter), `map/` (MapStage, Globe, FlatMap, RiskMarker), `phone/BasicPhone`.
- Demo timeline: start 2025-11-17, demo "today" 2026-11-16, end 2027-01-11. Locations are illustrative.

## Status
- Done: Phase 0 (scaffold), 1 (simulated data + data layer), 2 (learned forecast + alert engine), 3 (main screen, design v2, globe + SoI map with fly-in, clustering, glitch markers, 4 tabs, persona panel, lab readout, nearest safe source, alternatives #19-#28), 4 (persona warnings EN/HI + simulated basic phone + dispatch log + field replies).
- Phase 4 decisions: NO real SMS (UAE TDRA / India DLT sender registration impossible before deadline). Twilio removed; delivery is simulated and labelled SIMULATED. Field personas get Hindi by default, officers English; phone toggles. Alert fatigue: Watch goes only to Panchayat + officers (`receivesTier`); field users from Warning up, plus the Grey "check and reply" request. Clusters always show their most urgent member (`map/cluster.ts`, tested). Phone opens on the selected source's message for the chosen persona. Every template x source x tier must fit 2 SMS in both languages (tested). Demo-day warnings are the dispatch baseline; Reset restores it. Clicking a suggested alternative keeps the at-risk source selected (warning pinned) and draws a dashed route with distance; "Open <alt>" selects the alternative.
- Real data (16 Nov): `npm run fetch-real` caches REAL data in `data/real/` (no runtime API calls): ERA5 rain/temp/ET0 per source via Open-Meteo (REAL `climate` override, per-source `sources` series, day `origin`, `monsoon` vs ERA5 1991-2020 normal); CGWB GWRA 2025 parsed from the Jal Shakti PDF (`gwra-2025.json`: district balance, block categories, block HQ points); 16 CGWB observation wells from India Data Portal (`cgwb-wells.json`). `npm run generate` uses them (`src/lib/sim/realInputs.ts`): real climate drives levels; GWRA gap / (area x Sy 0.05) is added to groundwater-fed drift. Village-source levels stay SIMULATED. UI: map layers "CGWB blocks" / "CGWB wells" (+ well history card), readout "Groundwater context" card, footer credits, monsoon-deficit reason (text only, no SMS). Retuned: Tanka #2 target 1.85, Beri #3 0.85. `npm run demo-story` prints tiers over the clock. INGRES / India-WRIS / cgwb.gov.in unreachable from our network.
- Satellite (17 Nov): `fetch-real -- satellite` (`scripts/real/sentinel.ts`) uses the Planetary Computer STAC + Data API statistics (server-side, cached in `data/real/cache/sentinel-stats.json`): REAL `ndvi` override (500 m circle, SCL cloud > 10% skipped) and `water-bodies.json` (NDWI > 0 area of Gadisar, Hamirsar, Kaylana; haze flag in `src/lib/real/haze.ts`). Map layer "Lakes · S2" + LakeCard; readout NDVI row (last clear image dd-mm, cloudy count). Map polish: block names only when zoomed in (k >= 3.5) and never over source markers or labels (shared `layoutSources` + `boxes.ts`), hover otherwise; blue `--refwell` wells nudged clear of markers; collapsible legend (open >= 1280 px). Hindi watch line: "<source> का पानी तेजी से घट रहा है". Real NDVI moved Stepwell #6's Warning to +32 d (real 14-15 Nov shower + greening).
- Next: Phase 5 (Panchayat actions/escalation to MLA/MP, polish, final judges' notes).

## Design system v2 (approved 16 Nov 2026)
- Mood matches the login page: purple-black/maroon base, neon lab-green glow (highlights only), dusk amber accent, sand/cream text. Light mode = "desert daylight". Theme: system default, toggle in header, saved in localStorage (try/catch).
- Fonts via next/font: Bebas Neue (display), JetBrains Mono (labels + all numbers), Inter (body), Noto Sans Devanagari (Hindi).
- Risk colours are fixed and never the theme green: Safe teal-cyan circle ✓, Watch yellow triangle !, Warning orange diamond !, Emergency red octagon ✕, No data grey dashed circle ?. Confidence = opacity / dashed ring + printed label ("~5 wk · 70%").
- Map: `public/geo/*` (DataMeet SoI outline CC BY-SA 2.5/ODbL, SoI state lines CC BY 4.0, Natural Earth land); provenance in `public/geo/README.md`. No OSM/CARTO tiles. Globe (R3F, lazy, DPR <= 1.5, frameloop demand, slow-frame/WebGL-loss fallback to 2D) + flat MAP (SVG, d3-geo). Control box: GLOBE|MAP top-left, ZOOM IN/OUT/RESET bottom-right.
- Navigation: globe zoom capped; past the cap / on clicking India or a source it flies on and hands off to the map (one continuous move). Map pan/zoom writes the DOM via refs (no React render per frame), zooms toward pointer/selected source, clusters close markers.
- Data: 28 simulated sources; #19-#28 are Safe alternatives. Stepwell #6 (TH-06) is deliberately the one source with no suitable alternative.
- Nearest safe source: haversine; herders only animal-capable, households only drinkable public types; honest "none within X km" message.
- Themed labels always carry the plain meaning: "LAB READOUT · Source details". Warnings and numbers stay plain.
