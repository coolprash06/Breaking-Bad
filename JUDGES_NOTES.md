# Notes for judges

> Filled in progressively during the build. Final version due before 17 Nov 2026, 12:00 PM.

## Real vs simulated data

| Dataset | Status | Source / method |
|---|---|---|
| Groundwater levels (quarterly) | SIMULATED (to be replaced by REAL CGWB / India-WRIS) | 4 manual measurements a year for wells, borewells and stepwells |
| Rainfall and temperature (daily) | SIMULATED (to be replaced by REAL CHIRPS / IMD) | Deficit 2026 monsoon with early withdrawal (no rain since early Sep), rare winter showers |
| NDVI around sources | SIMULATED (optional REAL Sentinel-2) | Every 5 days, follows soil moisture; cloudy scenes skipped |
| Daily sensor readings between measurements | SIMULATED | Daily water balance: rain recharge, heat-driven evaporation, usage by category, aquifer drift, noise |
| Usage by persona category | SIMULATED | Households, animal-equivalents, pump-hours; seasonal (rabi pumping, summer herding) plus events |
| Sensor failures and gaps | SIMULATED | Random 1-7 day gaps, a 16-day outage, one dead sensor (Well #16), rare glitches |

All simulated data comes from one seeded generator (`npm run generate`, seed 20261116), so it is identical on every run. The REAL data drop-in point is `data/real/` (see its README). Each source's true physical parameters are kept in a hidden file that the app never reads. Tests use it to check that the model learns those parameters from the readings.

Locations are **illustrative** placeholders until the team confirms districts and villages.

## How the AI works

1. **Learning from data.** The model learns each source's own parameters from its past readings using regression. These are:
   - rain recharge
   - evaporation
   - usage rate for households, livestock and pumping
   - background trend (seepage, or refill from the surrounding aquifer)

   The method is weighted ridge regression with physical sign constraints, fitted on the change between consecutive valid readings, so sensor gaps are handled naturally. Sensor glitches are removed by a robust outlier filter. Nothing is hand-set per source. The "Learned from data" panel shows each value with its standard error, R² and the number of days used. In tests, the learner recovers the simulator's hidden parameters (for example, pumping rates to within 20%).
2. **Forecast with a confidence range.** A 500-run Monte Carlo ensemble projects the level 17 weeks ahead. Each run varies:
   - the learned parameters, within their errors
   - future usage
   - rain, sampled from last year's same-season rainfall
   - day-to-day noise

   The output is a P10–P90 band, a time-to-failure distribution, and statements such as "Likely to fail in 4–6 weeks (72% confident)". The confidence is the share of runs that fail inside that window.
3. **Messy data (F7).**
   - The band widens with the days since the last reading and with the recent gap ratio.
   - When a sensor is dead, a newer manual measurement is used as the starting point.
   - No sensor reading for more than 7 days shows **Grey**, never hidden.
   - Cloudy satellite images are skipped, and the last good value is used and labelled with its date.
4. **Alert engine (F4), balancing false alarms against missed alarms.**
   - **Tiers:**
     - Watch: dropping faster than usual and plausibly failing, or a 1-in-10 chance of failing within 8 weeks
     - Warning: median failure within 8 weeks
     - Emergency: median failure within 2 weeks, or the level is already at failure
   - **Agreement:** a source goes above Watch only if at least 2 of 3 independent signals agree (level falling, no rain for 30+ days, vegetation browning).
   - **Persistence:** a tier must hold for 3 consecutive days before the alert escalates, and for 3 days before it steps back down. A level already at failure escalates immediately.
   - Every alert states its confidence and its reasons.

## Demo login

`/login` is a placeholder for the team's existing login page. Click **Try demo (Panchayat)**.

## Open-source tools used

Next.js, React, TypeScript, Tailwind CSS, Leaflet, react-leaflet, OpenStreetMap tiles, Recharts, Vitest, tsx, Twilio SDK.
