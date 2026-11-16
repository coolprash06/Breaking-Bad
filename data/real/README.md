# REAL data (cached)

Everything here is downloaded once by `npm run fetch-real` and committed as JSON, so the app never calls an external API at runtime and the demo works offline. Raw downloads (the GWRA PDF, raw Open-Meteo responses) go to `cache/`, which is gitignored.

```
npm run fetch-real            # all parts
npm run fetch-real -- climate # one part: gwra | wells | climate
npm run generate              # re-drive the simulated village sources with the real data
```

| File | What | Source | Licence / terms | Used for |
|---|---|---|---|---|
| `climate.json` | Daily rain, Tmax/Tmin, FAO-56 reference evapotranspiration at each of the 28 sources (2025-11-17 to 2027-01-11); June-September 2026 total vs the 1991-2020 normal | ERA5 reanalysis (Copernicus C3S / ECMWF) via the [Open-Meteo](https://open-meteo.com/) historical archive; last 6 days from the Open-Meteo forecast API (`past_days`) | CC BY 4.0 (Open-Meteo); ERA5: Copernicus licence, attribution required | Registered in `index.ts` as the REAL `climate` dataset. Drives the simulated levels, the "No rain for N days" and "Monsoon was X% below normal" reasons |
| `gwra-2025.json` | District recharge, extractable resource, extraction, stage of extraction, recharge-worthy area; block categories; blocks whose category changed (with stage %); salinity-affected and saline units | [National Compilation on Dynamic Ground Water Resources of India, 2025](https://www.jalshakti-dowr.gov.in/static/uploads/2025/11/711d8d476bbf498cd90f8038e7371227.pdf), CGWB, Ministry of Jal Shakti, Government of India | Government of India publication (public); credit CGWB / Ministry of Jal Shakti | Background groundwater decline of simulated wells, borewells and stepwells; "CGWB blocks" map layer; groundwater card in the source readout |
| `cgwb-wells.json` | 16 CGWB observation wells near our sources: depth to water (m below ground), ~4 a year, 2014 to Jan 2024 | CGWB / India-WRIS, "Groundwater Level Collected Manually", via the [India Data Portal](https://ckandev.indiadataportal.com/dataset/groundwater-level) datastore API | Government of India data; the portal lists the licence as "not specified": credit CGWB, India-WRIS and the India Data Portal | "CGWB wells" map layer with history chart; nearest reference well in the readout |

Retrieved 16 Nov 2026.

## How each file is made

**`climate.json`** (`scripts/real/openMeteo.ts`). One multi-point request per segment. Each day is tagged with its origin in `origin` / `segments`:
- `era5` until ERA5's ~5-day lag (to 10 Nov 2026)
- `recent` from the forecast API's `past_days` (11-16 Nov 2026)
- `forecast` for the 16-day forecast after demo day
- `analogue` for the same calendar days one year earlier (ERA5)

Days after demo day are only revealed by the demo batch clock. Evaporation is ERA5-based FAO-56 ET0, replacing the simulator's Hargreaves estimate. District series are the mean of that district's sources. The monsoon normal is the ERA5 1991-2020 June-September mean at each source, not the IMD normal (see JUDGES_NOTES.md).

**`gwra-2025.json`** (`scripts/real/gwra.ts`). The PDF is parsed with pdfjs-dist. Pages are found by their headings, and list-table columns are recovered from the x positions of the "S. No" headers. Checks: recharge components sum to the total, and stage = extraction / extractable (no warnings on 16 Nov 2026).
- The background decline is `max(0, extraction − extractable) / (recharge-worthy area × specific yield)`, with specific yield 0.05. **The specific yield is our assumption**, not a CGWB figure.
- Results: Barmer 0.084, Jaisalmer 0.112, Bikaner 0.075 and Jodhpur (incl. Phalodi) 0.532 m/yr. Kachchh is 0, since its extraction is below its resource.
- Block HQ towns are geocoded with the Open-Meteo geocoding API (GeoNames, CC BY 4.0) and must fall in the right district. Not placed (no match): Chohtan, Gudhamalani, Serwa, Baytoo, Shekhala, Tiwari, Baori.
- Safe units are only counted in the compilation, not named. Every non-safe unit is named, so the unnamed ones in a district are Safe.

**`cgwb-wells.json`** (`scripts/real/cgwbWells.ts`). Uses CKAN `datastore_search_sql`. It picks CGWB stations with ≥ 20 readings since 2014 and one in 2022 or later, keeping the 2 closest (≤ 40 km) to each district's sources. The pre-monsoon trend is the least-squares slope of the Mar-Jun depths.

## Not available from here

- **INGRES** (`ingres.iith.ac.in`, block-level GWRA with recharge and extraction per block), **India-WRIS** and **cgwb.gov.in** did not resolve or respond from our network on 16 Nov 2026. Block-level stage % is therefore only shown where the national compilation prints it (blocks whose category changed).
- **CGWB groundwater quality (EC per well)** is on cgwb.gov.in / India-WRIS. We use the compilation's list of salinity-affected assessment units instead.

## Still SIMULATED

The daily level of each village source, the usage per persona category, the sensor gaps and the NDVI. No public daily data exists for individual village ponds, tankas and wells. They are simulated with real rain, real evaporation and the real district groundwater decline as drivers.
