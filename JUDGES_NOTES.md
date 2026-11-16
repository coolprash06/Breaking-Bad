# Notes for judges

> Filled in progressively during the build. Final version due before 17 Nov 2026, 12:00 PM.

## Real vs simulated data

| Dataset | Status | Source / method |
|---|---|---|
| Rainfall, temperature, evaporation (daily, at every source) | **REAL** | ERA5 reanalysis (Copernicus / ECMWF) via the Open-Meteo archive, 17 Nov 2025 to 10 Nov 2026; 11-16 Nov from the Open-Meteo forecast API (`past_days`). Evaporation = FAO-56 reference ET0. CC BY 4.0 |
| Monsoon 2026 vs normal | **REAL** | June-September 2026 total vs the ERA5 1991-2020 mean at each source (not the IMD normal, see below) |
| District groundwater balance (recharge, extraction, stage of extraction) | **REAL** | CGWB *National Compilation on Dynamic Ground Water Resources of India, 2025* (Ministry of Jal Shakti), parsed from the official PDF |
| Block categories (Safe / Semi-critical / Critical / Over-exploited / Saline) | **REAL** | Same compilation: categorisation chapter, national saline-units list, 2024-to-2025 change tables |
| Reference observation wells (depth to water, 2014 to Jan 2024) | **REAL** | 16 CGWB wells near our sources, via India-WRIS on the India Data Portal |
| Daily level of each village source (sensor readings) | SIMULATED, driven by REAL inputs | Daily water balance using the REAL rain and evaporation at the source and the REAL district groundwater decline, plus usage, noise and sensor gaps. No public daily data exists for individual village ponds, tankas and wells |
| Quarterly manual measurements of our sources | SIMULATED | 4 a year for wells, borewells and stepwells (CGWB-style); the real CGWB wells are shown separately as reference |
| NDVI around sources | SIMULATED (Sentinel-2 is the next step) | Every 5 days, follows soil moisture (now from real rain); cloudy scenes skipped |
| Usage by persona category | SIMULATED | Households, animal-equivalents, pump-hours; seasonal (rabi pumping, summer herding) plus events |
| Sensor failures and gaps | SIMULATED | Random 1-7 day gaps, a 16-day outage, one dead sensor (Well #16), rare glitches |
| Days after demo day (revealed by the batch clock) | REAL forecast, then analogue | Open-Meteo 16-day forecast to 1 Dec 2026, then the same dates one year earlier from ERA5 (labelled in the data) |
| India and state boundaries | REAL | DataMeet / Survey of India (see Map data below) |
| World land (globe) | REAL | Natural Earth 1:110m |

All REAL data is downloaded once by `npm run fetch-real` and cached as JSON in `data/real/` (see its README for exact sources, dates and licences), so the app never calls an external API and works offline. All simulated data comes from one seeded generator (`npm run generate`, seed 20261116), so it is identical on every run for the same cached real inputs. Each source's true physical parameters are kept in a hidden file that the app never reads. Tests use it to check that the model learns those parameters from the readings.

Locations are **illustrative** placeholders until the team confirms districts and villages.

There are 28 simulated sources. The 10 numbered #19 to #28 are nearby Safe alternatives, added so that every warning can name somewhere suitable to go. Each source has its own random stream, so adding them left the other 18 sources' data unchanged. One source is kept isolated on purpose: **Stepwell #6 (Phalodi)** has no suitable alternative within any persona's range. Its warning honestly says so and tells people to contact the Panchayat.

## Real data and what it changed (added 16 Nov 2026)

**Rain and evaporation are now real.** Every source uses the ERA5 rainfall and FAO-56 evapotranspiration at its own coordinates. So reasons like "No rain for 49 days" (Nadi #9) and "Monsoon 2026 was 22% below normal" are real statements about real weather. The real 2026 monsoon was below the ERA5 1991-2020 normal at most of our sources: -22% to -55% across Thar and most of Kutch, while near Rapar it was +36%.

**District groundwater stress is real** (CGWB GWRA 2025, figures in million m3/yr):

| District | Recharge | Extractable | Extraction | Stage | Gap | Decline used (m/yr) |
|---|---|---|---|---|---|---|
| Jaisalmer | 107 | 96 | 309 | 321.84% | +213 | 0.112 |
| Barmer | 386 | 349 | 469 | 134.5% | +120 | 0.084 |
| Bikaner | 313 | 282 | 396 | 140.57% | +114 | 0.075 |
| Jodhpur | 417 | 381 | 971 | 254.97% | +590 | 0.532 |
| Kachchh | 986 | 899 | 466 | 51.79% | -433 | 0.000 |

- The gap (extraction minus extractable resource) is turned into a background water-table decline by dividing by the recharge-worthy area and a **specific yield of 0.05**. That specific yield is our assumption, not a CGWB number. The decline is added only to sources that draw on the regional aquifer: dug wells, borewells and stepwells. Ponds, tankas and beris don't get it.
- Phalodi became a district in 2023, but GWRA 2025 still reports the Phalodi block under Jodhpur, so Stepwell #6 uses Jodhpur's figures (stage 255%, the steepest decline).
- Kachchh as a whole extracts less than it recharges (52%), so no regional decline is added there, even though Bhuj block is Over-exploited.

**Cross-check against real wells.** Pre-monsoon trends of the CGWB reference wells (m/yr, positive = water table falling):
- Jaisalmer: MOOLSAGAR +0.09, Moolsagar_Pz +0.36
- Barmer: SASION-KA-KUA +0.05, BARMER1 -0.20
- Jodhpur: Lordiya n/a, BAP1 +0.12
- Bikaner: KARMISAR -0.13, DESHNOKH +1.04
- Kachchh: Khavada +0.31, Khavda +0.53, Bhuj (Circuit House) +0.62, Madhapar -0.06, Rapar2 +1.00, Lilpur +0.06, Lakhpat -0.43, Moti cher -1.10

Point wells vary a lot. One Bikaner well falls 1 m/yr while another rises. Most Kutch wells are falling despite the district-level surplus. So the district decline we use is a conservative, regional background term, not a forecast for any single well.

**Map layers.** Two map layers can be switched on (top-left, MAP view):
- **CGWB blocks**: each named assessment unit at its block HQ town, with its 2025 category. Safe units are counted but not named in the compilation. Seven block towns could not be geocoded and are listed in the legend.
- **CGWB wells**: click a well for its depth-to-water history.

The source readout adds a "Groundwater context" card with the district's real figures, the nearest listed block, the 2026 monsoon vs normal and the nearest CGWB well.

**What had to change to keep the demo story.** No scenario events were changed. Two demo-day target levels were lowered, because the real (dry) Jaisalmer rainfall cannot refill them as high: Tanka #2 from 1.90 to 1.85 m, and Beri #3 from 0.90 to 0.85 m. The demo story holds:
- Nadi #9 is Warning on demo day, and the herder is sent to Well #22 (4 km).
- Well #4 goes Safe to Warning after pumping restarts (+7 days).
- Stepwell #6 is Watch on demo day and Warning from +21 days (was +14), with no suitable alternative.
- Well #16 is grey.

Side effects of the real weather:
- Nadi #9 reaches Emergency at +3 days instead of +7.
- Beri #3 is Safe on demo day (was Watch).
- Virda #11 and Borewell #18 start at Watch.

**Not used, and why.**
- INGRES (block-level GWRA with per-block recharge and extraction), India-WRIS and cgwb.gov.in did not respond from our network on 16 Nov 2026.
- Block stage % is shown only where the national compilation prints it.
- Groundwater quality per well (EC > 3000 uS/cm) is on those same unreachable sites. We show the compilation's salinity-affected units instead (Khajuwala in Bikaner, Gandhidham in Kachchh). None is near our sources.
- The monsoon normal is ERA5's own 1991-2020 mean, not the IMD gridded normal. The IMD grids are binary files that would need 30 years of downloads to build a normal, and comparing ERA5 with its own normal avoids mixing datasets.


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

**Dispatch from the engine.** When the batch clock moves and a source's tier escalates (Watch → Warning → Emergency, or the sensor goes silent), the engine sends that source's messages to the persona groups that use it. Each log entry shows the demo date, persona group, number of recipients and language. A source never gets two messages for the same tier, and stepping back down sends nothing. Reset returns to demo day and clears everything sent since. Warnings already active on demo day are shown as sent that morning. Recipient counts are simulated from each source's registered users: one phone per household, one herder per ~50 animals, about one in three households for bathing, 2 tanker operators per large drinking source, a 25-phone route list for travellers, and one per farm.

**Alert fatigue (our answer to the false-alarm desert rule).** Watch only means "dropping faster than usual", so a Watch goes to the Village Panchayat and officers (district water officer; the NGO only if tankers are needed), who can check before anyone is alarmed. Field users (households, tankers, herders, bathing, travellers, farmers) are warned from Warning upward. The one exception is a source whose sensor has gone silent: its field users are asked to check the water and reply 1 = low or 2 = fine, because that asks for help rather than raising an alarm. Together with 2-of-3 signal agreement and the 3-day persistence check, this keeps field messages rare and worth acting on. The persona panel still previews what a field user would get at Watch, marked "Not sent at Watch".

**Replies (F9).** On a field persona's phone, keys 1 and 2 reply "water low" or "still fine". The reply appears in the dispatch log as a field report.

## Demo login

`/login` is a placeholder for the team's existing login page. Click **Try demo (Panchayat)**.

## Map data and credits

No third-party map tiles are used: their borders differ from India's official boundary. The globe and map are drawn only from these files (details in `public/geo/README.md`):

- India outline: [`india-soi.geojson`](https://github.com/datameet/maps/blob/master/Country/india-soi.geojson) by the [DataMeet India community](http://datameet.org/), from Census 2011 / Survey of India data. Licence **CC BY-SA 2.5 / ODbL** (stated in the repo's `Country/README.md`). Our simplified copy is shared under the same terms.
- State lines: [`Survey-of-India-Index-Maps/Boundaries/India-States`](https://github.com/datameet/maps/tree/master/Survey-of-India-Index-Maps/Boundaries) by DataMeet. No file-specific licence, so the repository default **CC BY 4.0** applies.
- World land: Natural Earth 1:110m (public domain), via the `world-atlas` package.

## Open-source tools used

Next.js, React, TypeScript, Tailwind CSS, three.js, React Three Fiber, d3-geo, Recharts, Vitest, tsx, pdfjs-dist (to read the CGWB 2025 PDF in `npm run fetch-real`). Data APIs (fetch time only): Open-Meteo archive, forecast and geocoding APIs; India Data Portal CKAN datastore. Fonts (Google Fonts via `next/font`): Bebas Neue, JetBrains Mono, Inter, Noto Sans Devanagari. mapshaper (via `npx`) was used once to simplify the boundary files.
