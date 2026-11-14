# Fire calendar (website)

Web app for the NASA Space Apps 2026 challenge *MODIS and VIIRS Hot Spots*. It shows when an area burns: a years × months calendar of FIRMS detections, the fire season, anomalies against the multi-year average, and CSV downloads. The MVP covers Brazil.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + static build in dist/
```

With mise, from the repository root: `mise run web:dev`, `mise run web:build`.

## Data

Everything the app needs for Brazil is committed in `public/data/brazil/`:

| File | Content |
| --- | --- |
| `monthly_grid.json` | MODIS Terra + Aqua (Collection 6.1 standard), counts per 0.5° cell and month, Nov 2000 to Dec 2025. Kept: confidence ≥ 30 and `type = 0` (vegetation fire). |
| `recent_hotspots.json` | Last 7 days of near-real-time MODIS and VIIRS (NOAA-20, NOAA-21) points inside Brazil. |
| `meta.json` | Build date and source URLs. |

Rebuild them from FIRMS (no API key; about one minute):

```sh
npm run data:brazil                     # history + last 7 days
npm run data:brazil -- --skip-history   # only refresh the last 7 days
```

Averages and rankings use 2003 onward, when both MODIS satellites flew. Earlier years are shown but faded.

### Other regions

The weekly exports from `llama-masters-research` can be added with `npm run data:sync` (copied to `public/data/regions/`, not committed). If `VITE_DATA_URL` points to the Go API (see `.env.example`), the region list and hotspot downloads come from it instead; the app falls back to the static files when the API is unreachable.

## Deploy

Static site. On Vercel or Netlify, set the root directory to `website/`, build command `npm run build`, output `dist/`. `VITE_DATA_URL` is optional.
