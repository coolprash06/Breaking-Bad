# REAL data drop-in folder

Put REAL datasets here and register them in `index.ts`. The app then uses them instead of the SIMULATED versions and labels them **REAL** in the UI.

Each file must be a `Dataset` wrapper, in the same shape as the matching file in `../simulated/`:

```json
{
  "id": "climate",
  "provenance": "REAL",
  "title": "Rainfall and temperature",
  "source": "CHIRPS daily via Google Earth Engine",
  "note": "Extracted per district centroid, 2025-11-17 to 2026-11-16",
  "data": { "...": "same shape as data/simulated/climate.json" }
}
```

| Dataset id | Expected REAL source | Shape |
|---|---|---|
| `observations` | CGWB / India-WRIS observation wells | `{ [sourceId]: [{ date, levelM }] }` |
| `climate` | CHIRPS (GEE) or IMD | daily arrays per district, starting at `start` |
| `ndvi` | Sentinel-2 (GEE) | `{ [sourceId]: [{ date, value \| null, cloudy }] }` |

Daily arrays must start on the timeline start date in `../simulated/manifest.json`, with one value per day.
