# 4-web_atlas: fire calendar

Web app for the NASA Space Apps 2026 challenge _MODIS and VIIRS Hot Spots_. It shows when a country burns: a years × months calendar of FIRMS hotspots on one harmonized MODIS + VIIRS record (NOAA-20 scale), the fire season, anomalies against the 2003–2025 average, month-by-month playback on the map, the last 7 days of hotspots, and CSV downloads.

All data comes from the API (`3-api_atlas`), which serves the files written by `2-process_data/src/export.py`. The site has no data of its own.

## Stack

React 18, TypeScript, Tailwind 4, MapLibre 6, built with [Vite+](https://viteplus.dev) (`vp`: Vite, Oxlint and Oxfmt in one tool, MIT). Bun is the package manager.

## Run

```sh
bun install
bun run dev        # vp dev, http://localhost:5173
bun run check      # vp check: format, lint and type check
bun run fix        # vp check --fix: apply the formatter and lint fixes
bun run build      # tsc + vp build -> dist/
```

The dev server calls the API on the same origin by default. To use the deployed API, copy `.env.example` to `.env.local`:

```sh
VITE_API_URL=https://llama-masters-api.esauflores.com
```

## API used

| Route                     | Used for                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/v1/places`              | Country list (search by name or ISO code)                                                                                                                                            |
| `/v1/places/<id>/grid`    | `monthly_grid.json` v6: 0.1° cells (coarser for big countries), raw MODIS and VIIRS-scale counts and mean brightness temperatures per month, as compact columns decoded in `data.ts` |
| `/v1/places/<id>/monthly` | Country and state series, baseline, conversion scores                                                                                                                                |
| `/v1/places/<id>/meta`    | Satellite coverage, harmonization factors, sources, limits                                                                                                                           |
| `/v1/places/<id>/recent`  | Last 7 days of hotspots (columnar)                                                                                                                                                   |

Files that start after January (the record starts in November 2000) are padded on load so month 0 is always January (`src/lib/data.ts`).

## Deploy

Served by the `3-api_atlas` Worker as static assets, on the same origin as the API.
