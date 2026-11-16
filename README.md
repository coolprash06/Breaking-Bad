# WellCast: water early warning for Thar & Kutch

Breaking Bytes Hackathon, Track 2 (Water & Climate AI).

An AI early-warning system for water sources in the Thar Desert (Rajasthan) and Kutch (Gujarat). It learns how each source behaves from its past readings, forecasts its level and time until failure with a confidence range, and sends persona-specific warnings weeks in advance.

See `prd.txt` for the full requirements and `JUDGES_NOTES.md` for which data is real and which is simulated. Map boundary sources and licences: `public/geo/README.md`.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in Twilio values (optional)
npm run generate             # writes data/simulated/*.json
npm run dev                  # http://localhost:3000
npm test                     # engine unit tests
```

## Routes

| Route | What |
|---|---|
| `/` | Main screen: batch clock, 4 purpose tabs, personas, 3D globe / flat map, source readout |
| `/login` | **Placeholder**: the team's existing login page merges here |
| `/panchayat` | Category 4 dashboard (demo session) |

## Secrets

All secrets live in `.env.local`, which is gitignored. `.env.example` lists the variable names only.
