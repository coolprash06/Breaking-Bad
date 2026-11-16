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
| India and state boundaries | REAL | DataMeet / Survey of India (see Map data below) |
| World land (globe) | REAL | Natural Earth 1:110m |

All simulated data comes from one seeded generator (`npm run generate`, seed 20261116), so it is identical on every run. The REAL data drop-in point is `data/real/` (see its README). Each source's true physical parameters are kept in a hidden file that the app never reads. Tests use it to check that the model learns those parameters from the readings.

Locations are **illustrative** placeholders until the team confirms districts and villages.

There are 28 simulated sources. The 10 numbered #19 to #28 are nearby Safe alternatives, added so that every warning can name somewhere suitable to go. Each source has its own random stream, so adding them left the other 18 sources' data unchanged. One source is kept isolated on purpose: **Stepwell #6 (Phalodi)** has no suitable alternative within any persona's range. Its warning honestly says so and tells people to contact the Panchayat.

## How the AI works

1. **Learning from data.** The model learns each source's own parameters from its past readings using regression. These are:
   - rain recharge
   - evaporation
   - usage rate for households, livestock and pumping
   - background trend (seepage, or refill from the surrounding aquifer)

   The method is weighted ridge regression with physical sign constraints, fitted on the change between consecutive valid readings, so sensor gaps are handled naturally. Sensor glitches are removed by a robust outlier filter (residuals beyond 5 robust standard deviations). The level chart marks each rejected reading with a small x: "Sensor glitch - ignored by the model". Nothing is hand-set per source. The "Learned from data" panel shows each value with its standard error, R² and the number of days used. In tests, the learner recovers the simulator's hidden parameters (for example, pumping rates to within 20%).
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
5. **Nearest safe source (F5).** Every field warning names the nearest *Safe* source that suits that person, using straight-line (haversine) distance between source coordinates:
   - herders: only sources marked animal-capable, within 25 km
   - households and travellers: only drinkable source types that people already draw from (not open ponds or wetlands, not private farm borewells), within 8 km for households, 30 km for travellers, 40 km for tankers
   - Grey (no data) and at-risk sources are never suggested.
   - If nothing suitable is in range, the warning says so and gives the distance to the closest option, for example: "No safe water for animals found within 25 km. The closest is Well #7, 315 km away. Contact the Panchayat."

## Warnings and delivery (F5, F6)

**Delivery is simulated.** Warnings arrive on a simulated basic phone inside the app, and every one is listed in the dispatch log. Both are labelled SIMULATED. No real SMS is sent in the demo: an unregistered sender ID is blocked by UAE carriers (TDRA sender-ID registration) and India requires DLT registration of the sender and every message template, and neither could be completed before the deadline. A real deployment would send the same text through an SMS gateway using a registered sender ID (DLT in India, TDRA in the UAE). The app has no SMS dependency and needs no secrets.

**One template per persona, filled only from engine output:** tier, failure window in weeks, confidence, the top reason, the nearest *suitable* Safe source with its distance, and an "act by" date (the early P10 edge of the failure window). Nothing is hard-coded per source.

- Fetch & Carry (households, tankers): which Safe source to use and how far.
- Use on Spot (herders, bathing, travellers): where to go and by when.
- Pump at Scale (farmers): how much a 30% pumping cut gains, from a re-run of the same forecast with pumping reduced.
- Manage & Oversee (Panchayat, district officer, NGO): the source's status plus a district summary (sources at risk, households, animals, farms) and either the nearest safe drinking water or "send tankers". The NGO is only messaged in an emergency or when no drinking water is within 8 km.
- Stepwell #6, the source with no suitable alternative, says so honestly and tells people to contact the Panchayat.

**English and Hindi.** Field users receive simple village-level Hindi by default and officers receive English; the phone has a toggle to read either. Every message is kept within 2 SMS: English uses only GSM-7 characters (160 per SMS, 153 per part when split), and Hindi is UCS-2 (70 per SMS, 67 per part). If a message would run longer, optional parts are dropped in a fixed order (first the closest far-away option, then "be ready", then the reason). A test checks every persona × source × tier in both languages. The phone shows the character count, number of SMS and encoding.

**Dispatch from the engine.** When the batch clock moves and a source's tier escalates (Watch → Warning → Emergency, or the sensor goes silent), the engine sends that source's messages to every persona group that uses it. Each log entry shows the demo date, persona group, number of recipients and language. A source never gets two messages for the same tier, and stepping back down sends nothing. Reset returns to demo day and clears everything sent since. Warnings already active on demo day are shown as sent that morning. Recipient counts are simulated from each source's registered users: one phone per household, one herder per ~50 animals, about one in three households for bathing, 2 tanker operators per large drinking source, a 25-phone route list for travellers, and one per farm.

**Replies (F9).** On a field persona's phone, keys 1 and 2 reply "water low" or "still fine". The reply appears in the dispatch log as a field report.

## Demo login

`/login` is a placeholder for the team's existing login page. Click **Try demo (Panchayat)**.

## Map data and credits

No third-party map tiles are used: their borders differ from India's official boundary. The globe and map are drawn only from these files (details in `public/geo/README.md`):

- India outline: [`india-soi.geojson`](https://github.com/datameet/maps/blob/master/Country/india-soi.geojson) by the [DataMeet India community](http://datameet.org/), from Census 2011 / Survey of India data. Licence **CC BY-SA 2.5 / ODbL** (stated in the repo's `Country/README.md`). Our simplified copy is shared under the same terms.
- State lines: [`Survey-of-India-Index-Maps/Boundaries/India-States`](https://github.com/datameet/maps/tree/master/Survey-of-India-Index-Maps/Boundaries) by DataMeet. No file-specific licence, so the repository default **CC BY 4.0** applies.
- World land: Natural Earth 1:110m (public domain), via the `world-atlas` package.

## Open-source tools used

Next.js, React, TypeScript, Tailwind CSS, three.js, React Three Fiber, d3-geo, Recharts, Vitest, tsx. Fonts (Google Fonts via `next/font`): Bebas Neue, JetBrains Mono, Inter, Noto Sans Devanagari. mapshaper (via `npx`) was used once to simplify the boundary files.
