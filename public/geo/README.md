# Boundary data (REAL, third-party data, not code)

The globe and the flat map are drawn only from these files. No third-party map tiles are used, because tile providers' borders differ from India's official boundary.

| File | What | Source | Licence |
|---|---|---|---|
| `india-soi.json` | India outline, detailed (flat map) | [`Country/india-soi.geojson`](https://github.com/datameet/maps/blob/master/Country/india-soi.geojson), DataMeet India community. Dissolved from Census 2011 districts / Survey of India; follows the official boundary of India (all of J&K and Ladakh). | **CC BY-SA 2.5 / ODbL**, as stated in [`Country/README.md`](https://github.com/datameet/maps/blob/master/Country/README.md). Our simplified file is shared under the same terms. |
| `india-soi-globe.json` | Same outline, coarser (3D globe) | As above | As above |
| `india-state-lines.json` | Internal state borders | [`Survey-of-India-Index-Maps/Boundaries/India-States`](https://github.com/datameet/maps/tree/master/Survey-of-India-Index-Maps/Boundaries), DataMeet India community | **CC BY 4.0**: no file-specific licence is stated, so the repository default applies ("Unless explicitly stated, all datasets in this repository is shared under CC BY 4.0", [README](https://github.com/datameet/maps#data-license)). |
| `world-land.json` | World land, no country borders | Natural Earth 1:110m land, via the `world-atlas@2.0.2` package | Public domain (Natural Earth) |

Licences checked on 16 Nov 2026.

## How the files were made

Downloaded on 16 Nov 2026 and simplified with [mapshaper](https://github.com/mbloch/mapshaper) 0.6.102 (run with `npx`, not a project dependency):

```
mapshaper india-soi.geojson -simplify 1.5% keep-shapes -filter-islands min-area=50km2 -filter-fields Source -o india-soi.json precision=0.001 format=geojson
mapshaper india-soi.geojson -simplify 0.4% keep-shapes -filter-islands min-area=500km2 -filter-fields Source -o india-soi-globe.json precision=0.01 format=geojson
mapshaper India-States.shp -simplify 2% keep-shapes -innerlines -o india-state-lines.json precision=0.001 format=geojson
mapshaper land-110m.json -o world-land.json precision=0.01 format=geojson
```

`src/lib/geo/boundaries.ts` fixes polygon winding for d3-geo when the files load.
