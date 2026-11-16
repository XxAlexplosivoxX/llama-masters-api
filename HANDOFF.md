# Handoff: llama-masters

State on 2026-11-16, for whoever picks this up next (person or agent). Read this first, then the
README of the step you work on.

## What this is

NASA Space Apps 2026, challenge "MODIS and VIIRS Hot Spots" ([CHALLENGE.md](CHALLENGE.md)).
FIRMS fire detections from two generations of satellites, MODIS (Terra/Aqua, 2000→) and VIIRS
(S-NPP 2012→, NOAA-20, NOAA-21), turned into **one continuous monthly record per country on the
VIIRS scale**, served by an API and explored on a map website.

- Site: <https://tonalli.earth> (landing) and <https://tonalli.earth/atlas/> (atlas). The older
  addresses atlas.tonalli.earth and llama-masters.esauflores.com redirect to `/atlas/`.
- API: <https://llama-masters-api.esauflores.com/v1/places>
- Code: branch `monorepo` of <https://github.com/XxAlexplosivoxX/llama-masters-api> (remote `origin`).
  The team's earlier Go API lives on that repo's `main`; `monorepo` has its own history (no common
  commit), so a PR into `main` needs a merge commit first (`git merge origin/main
  --allow-unrelated-histories`, done in a separate worktree so this folder stays clean).
  The previous private repo is remote `esauflores`.

## Layout and data flow

```
NASA FIRMS ──1-extract_data──▶ R2 raw/ ──2-process_data──▶ R2 clean/ → aggregates/ → exports/
                                                                                   │
              5-web_landing + 4-web_atlas (React) ◀── 3-api_atlas (Cloudflare Worker) ◀─┘
```

| Step | What | Runs on | Docs |
|---|---|---|---|
| `0-plans/` | Plans: harmonization (the method), hackathon, visualization, forecasting | — | [README](0-plans/README.md) |
| `1-extract_data/` | FIRMS yearly archives + area API → `raw/` Parquet | Railway `extract-1..4` | [README](1-extract_data/README.md) |
| `2-process_data/` | `prepare` → `clean` + `aggregate` (8 shards) → `export` | Railway `prepare`, `process-1..8`, `export` | [README](2-process_data/README.md) |
| `3-api_atlas/` | Hono Worker: serves `exports/` from R2 and the built site | Cloudflare Workers | [README](3-api_atlas/README.md) |
| `4-web_atlas/` | The atlas, map-first (React, MapLibre, Vite+), at `/atlas/` | Same Worker, static assets | [README](4-web_atlas/README.md), [AGENTS](4-web_atlas/AGENTS.md) |
| `5-web_landing/` | Landing page at tonalli.earth (React, Vite+) | Same Worker, static assets | [README](5-web_landing/README.md) |

Everything heavy runs on Railway; R2 bucket `llama-masters-firms` holds all data. **Nothing big is
downloaded to a laptop.** Railway services are declared in [`.railway/railway.ts`](.railway/railway.ts).

## The method in one paragraph

Counts are harmonized onto the NOAA-20 (VIIRS) scale: months covered by a VIIRS satellite use it
directly (NOAA-20, else NOAA-21 × f21, else S-NPP × fNPP, never summed); months before VIIRS
(2000-11 → 2012-01) are reconstructed from MODIS with a per-0.5°-cell ratio, a calendar-month
factor and fNPP, all shrunk toward country and world values. Leave-one-year-out scoring per
country and state picks the cell model or a simpler fallback and gives p10–p90 bands. Details:
[HARMONIZATION_PLAN.md](0-plans/HARMONIZATION_PLAN.md) and [2-process_data/README.md](2-process_data/README.md).

## API

`GET /v1/places` (list, each entry with `version`), `GET /v1/places/:id/:file?v=<version>` where
`file` is `meta`, `monthly`, `grid` (`monthly_grid.json`), `recent` (last 7 days of points) or
`outline` (country border). Versioned URLs are cached for a year; a new export changes the versions.

`monthly_grid.json` is **version 6**: per 0.1° (or coarsened) cell, harmonized and MODIS counts plus
mean brightness temperature (`modis_bt`, `viirs_bt`, kelvin). The site reads versions 5 and 6.

## Website: what it does now

- Toolbar: country picker (grouped by continent), **Play** (month-by-month playback), History /
  Last 7 days, map options (satellite or night basemap, grid opacity, globe or flat), **Calendar**.
- Calendar card: one year as 12 month tiles coloured by detections. Hover previews a month;
  **click pins it** (accent ring, pin icon), click again unpins. Details opens the stats panel
  (charts, anomalies, sensors, CSV export).
- Legend: detections scale, and a **Temperature** on/off button with °C / °F / K.
- Temperature view: colour = mean fire brightness temperature, **harmonized** (MODIS mapped onto
  the VIIRS I4 scale by quantile mapping, fitted in the browser on the cell-months both sensors
  saw, in `4-web_atlas/src/lib/temperature.ts`); solidity = detections (cells with few fires are faint).
  In the MODIS-only or VIIRS-only views each sensor keeps its own scale.
- Country border highlight, loading pill at the top centre.

Brightness temperature is the whole satellite pixel (VIIRS 375 m, MODIS 1 km), so it reads
36–75 °C, not flame temperature. VIIRS I4 saturates near 367 K. In Brazil VIIRS reads about 13 K
hotter than MODIS in the same cell and month, which is why temperature needs harmonizing.

## Commands

```sh
mise install && mise run setup             # Python 3.12 (uv), Bun
mise run api:test                          # 3-api_atlas tests (bun test)
cd 4-web_atlas && bun run check                  # format, lint, types (Vite+); `bun run fix` to fix
cd 4-web_atlas && VITE_API_URL=https://llama-masters-api.esauflores.com bun run build \
  && bunx vp preview --port 4173           # local site against the live API
cd 3-api_atlas && bun run deploy                 # builds both sites into site/, deploys Worker + sites

# Pipeline on Railway, from the repo root (order matters)
npx -y @railway/cli@5.74.0 up --service prepare --detach
for k in 1 2 3 4 5 6 7 8; do npx -y @railway/cli@5.74.0 up --service process-$k --detach; done
npx -y @railway/cli@5.74.0 up --service export --detach     # ~25 min, writes places.json last
npx -y @railway/cli@5.74.0 logs --service export
```

Secrets (FIRMS map keys, R2, Cloudflare) live in `.env` (git-ignored, see `.env.example`) and in
Railway variables. Never print or commit them.

## Current state

- Last full pipeline run: 2026-11-15. `prepare` and all 8 `process` workers finished (238 countries cleaned and aggregated, 0 failed). `export` finished: 235 places, 0 failed.
- Deployed on 2026-11-16 00:03 UTC: Cloudflare version `e35f941c-240e-47f0-ae47-9bb627feba61` (previous:
  `f66a3940-8b06-421e-a741-48716796abb6`), with the Tonalli ATLAS name and link home, the product tour, the
  Caribbean split from North & Central America, and the clearer panel and CSVs. Deploying from an account
  member without access to the esauflores.com zone uploads the Worker but cannot re-assert the
  esauflores.com custom domains (error 10084); the existing domains keep working.
- Earlier deploy on 2026-11-16: Cloudflare version `142613ed-5b45-4932-ae84-2400d54d21ad`; the `atlas.tonalli.earth` domain was added in version `26dc9e45-62a5-4b3c-9e28-741cc430a691`.
  Includes harmonized history temperature, hotspots-as-solidity, click-to-pin calendar months,
  incomplete final-year navigation (2026), taller legends with year-first abbreviated dates,
  recent Both / MODIS / VIIRS buttons, temperature controls in Map options with a blue active cog,
  and a caption matching the loader's top-centre pill.
- Verified in a real browser; web checks pass (0 errors, 8 existing floating-promise warnings),
  production build passes, and all 20 API tests plus API type checks pass.
- Pushed to `origin/monorepo` on 2026-11-16.

## Open items

1. (done) Code is pushed to `origin/monorepo`.
2. Last 7 days temperature still uses one scale per sensor; harmonize with the same mapping
   (`harmonizedTemps(grid).toViirs`) for MODIS points.
3. Temperature over the full 26-year range looks uniformly hot (every cell has many fires); consider
   defaulting the temperature view to the latest month or year.
4. Report the temperature mapping's error the way counts are scored (leave one year out) and
   document it in `2-process_data/README.md` / the plan.
5. Decide with the team how `monorepo` and the Go API on `main` come together (merge commit PR,
   or keep separate).
6. The API layer (`1-extract_data/src/api.py`) must be rerun to pick up new days, followed by
   `process-*` and `export`. Check Railway for whether a schedule exists before relying on it.

## Working conventions

- Heavy data work runs on Railway, never locally. R2 is the source of truth.
- UI text is English only. Ask before adding libraries.
- Test UI changes in a real browser before calling them done (headless Playwright is fine for
  errors and timing, not for layout).
- Don't commit, push or deploy without the team's go-ahead; deploy the site **before** an export
  that changes a file format, since the live site must be able to read the new files.
