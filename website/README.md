# Fire calendar (website)

For agents and new contributors: [AGENTS.md](AGENTS.md) explains the data, the harmonization, the code map and known traps.

Web app for the NASA Space Apps 2026 challenge *MODIS and VIIRS Hot Spots*. It shows when an area burns: a years × months calendar of FIRMS hotspots on one harmonized MODIS + VIIRS record, the fire season, anomalies against the multi-year average, month-by-month playback, and CSV downloads. The MVP covers South America, with Brazil first.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + static build in dist/
```

With mise, from the repository root: `mise run web:dev`, `mise run web:build`.

## Data

Each country lives in `public/data/<country>/` (committed) and is listed in `public/data/places.json`. Built: Brazil (the MVP, opens first), the other 12 South American countries, and **South America** as a whole (`south-america`, the sum of the country grids with its own harmonization fit).

| File | Content |
| --- | --- |
| `monthly_grid.json` | Detections per 0.5° cell and month for **MODIS** (Terra + Aqua, C6.1, from Nov 2000) and **VIIRS S-NPP** (C2, 375 m, from Jan 2012), to the latest available day, plus the fitted MODIS-equivalent adjustment and its test scores. Kept: MODIS confidence ≥ 30, VIIRS not `low`, `type = 0` where reported. |
| `recent_hotspots.json` | Last 7 days of near-real-time MODIS and VIIRS (S-NPP, NOAA-20, NOAA-21) points inside the country. |
| `meta.json` | Build date, coverage per sensor, test score. |

Past years come from NASA's yearly country archives (no key). The current year comes from the FIRMS area API, standard processing where released and near-real-time after it (flagged provisional), which needs a free key in `website/.env.local`:

```sh
FIRMS_MAP_KEY=...   # https://firms.modaps.eosdis.nasa.gov/api/map_key/ ; never prefix with VITE_
```

```sh
npm run data:brazil                                  # Brazil
npm run data:country -- --country bolivia            # any country in COUNTRIES (scripts/build-country.mjs)
npm run data:country -- --country brazil --no-api    # archives only, no key needed
npm run data:country -- --region south-america        # after the countries: sums them, refits
```

Downloads are aggregated per sensor and year into `.cache/` (git-ignored), so a rerun only fetches the current year and the last 7 days. A first Brazil build streams about 2.5 GB. The API allows 5,000 transactions per 10 minutes; the script waits when it hits the limit.

### MODIS and VIIRS harmonization

Raw VIIRS reports about 3.7× more detections than MODIS over Brazil because its pixels are smaller, so raw counts are never compared directly. The calendar and map show one **harmonized record** by default: MODIS alone before 2012, then the mean of MODIS and VIIRS converted to the MODIS scale. The conversion estimates what MODIS would have reported from VIIRS, per 0.5° cell and calendar month:

MODIS ≈ k_m · ((1 + VIIRS)^β_m − 1)

β_m is the log-log slope over cell-months where VIIRS saw fire (β < 1: one large fire fills many 375 m pixels but fewer 1 km ones), and k_m makes the training totals match. It is fitted on 2012–2019 and tested on 2020–2025 against real MODIS. For Brazil, the monthly error (WAPE) is 10.0 % with −3 % bias, against 10.6 % for a single fixed ratio and 270 % for raw VIIRS. The panel shows the same check for any selected area, and the monthly CSV keeps raw MODIS, raw VIIRS and the harmonized column side by side.

Averages and rankings use 2003 onward for MODIS (both satellites flying) and 2012 onward for VIIRS.

### Other regions

The weekly exports from `llama-masters-research` can be added with `npm run data:sync` (copied to `public/data/regions/`, not committed). If `VITE_DATA_URL` points to the Go API (see `.env.example`), the region list and hotspot downloads come from it instead; the app falls back to the static files when the API is unreachable.

## Deploy

Static site. On Vercel or Netlify, set the root directory to `website/`, build command `npm run build`, output `dist/`. `VITE_DATA_URL` is optional.
