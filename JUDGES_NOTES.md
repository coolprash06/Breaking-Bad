# Notes for judges

> Filled in progressively during the build. Final version due before 17 Nov 2026, 12:00 PM.

## Real vs simulated data

| Dataset | Status | Source / method |
|---|---|---|
| Groundwater levels (quarterly) | SIMULATED (to be replaced by REAL CGWB / India-WRIS) | _TBD_ |
| Rainfall (daily) | SIMULATED (to be replaced by REAL CHIRPS / IMD) | _TBD_ |
| NDVI around sources | SIMULATED (optional REAL Sentinel-2) | _TBD_ |
| Daily sensor readings between measurements | SIMULATED | Seeded generator, `scripts/generate-data.ts` |
| Usage by persona category | SIMULATED | Seeded generator |
| Sensor failures and gaps | SIMULATED | Seeded generator |

Locations are **illustrative** placeholders until the team confirms districts and villages.

## Demo login

`/login` is a placeholder for the team's existing login page. Click **Try demo (Panchayat)**.

## Open-source tools used

Next.js, React, TypeScript, Tailwind CSS, Leaflet, react-leaflet, OpenStreetMap tiles, Recharts, Vitest, tsx, Twilio SDK.
