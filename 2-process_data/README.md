# 2. Process data

Raw hotspots in R2 → harmonized monthly burning activity, one stage per script, one R2 layer
per stage. Method and targets: [the harmonization plan](../0-plans/HARMONIZATION_PLAN.md).

| Stage | Reads → writes | Status |
|---|---|---|
| `src/prepare.py` | `raw/` → `reference/` (world ADM1, cell owners, static cells, work list) and `staging/api/` (API rows split by country) | done |
| `src/clean.py` | `raw/` + `staging/` → `clean/country=<C>/sensor=<s>/part.parquet`, sharded over workers | done |
| `src/aggregate.py` | `clean/` → `aggregates/country=<C>/`: counts per satellite × 0.1° cell × state × month, plus the latest points; runs on the same workers right after `clean.py` | done |
| `src/export.py` | `aggregates/` → `exports/`: the harmonized record (fit, leave-one-year-out scores, fallback, bands) and the files [3-api](../3-api/README.md) serves | done |

## prepare.py (once per run)

- boundaries: geoBoundaries CGAZ ADM1 (world, one file) → `reference/boundaries/adm1.parquet`,
  downloaded once (`--refresh-boundaries` to update)
- cell owners: each 0.1° cell belongs to the country with the most archive detections in it,
  so every API row goes to exactly one country → `staging/api/sensor=<s>/country=<C>/`
- static cells: archive cells with `type != 0` (0.01° MODIS, 0.005° VIIRS), for NRT rows
- cell states: 0.1° cells wholly inside one state (no outline crosses them) →
  `reference/cell_states.parquet`, so most points skip the exact polygon test
- work list: `reference/countries.parquet` (country, archive rows, `prepared_at`)
- fingerprint: archive and boundary file names, sizes and dates. When unchanged, the tables
  above are kept and only the API split runs (`--rebuild` forces them)

## clean.py (one worker per shard)

`--shard K/N` takes the countries largest first, each to the least loaded worker. A country
whose report has the current `prepared_at` is skipped, so a restarted worker resumes. Per
country and sensor: archive rows plus its API rows after the archive's last day, then

- static sources out: `type != 0`, or for NRT rows the static cells
- confidence: MODIS ≥ 30, VIIRS without `low`
- state from the cell table when the point's cell is wholly inside one of the country's states;
  otherwise (border and coast cells) point in polygon with shapely (prepared polygons, STRtree)
  among the states of the country's ISO groups (from the rows of the cells it owns), nearest
  state within 0.1° for points just outside

One query per sensor gives the report counts and the distinct border points, shapely places
those in parallel threads, and a second pass writes the rows. No temp tables, no sort (aggregate
sorts), so memory stays around 1 GB even for the largest countries.

Columns: latitude, longitude, acq_date, acq_time, satellite, confidence, frp, state, state_id,
iso, source (archive/api), provisional (NRT). What each filter removed:
`clean/_reports/country=<C>/cleaning.parquet` and the log.

## aggregate.py (one worker per shard, after clean.py)

Same shards as `clean.py`. Per country: `cells.parquet` (satellite Terra/Aqua/S-NPP/NOAA-20/NOAA-21,
0.1° cell `x`, `y`, `state_id`, `month`, `n`, `provisional`), `recent.parquet` (the country's last
7 days of points) and a report per satellite (first and last day, first NRT day). A country is
skipped when its report is newer than its cleaning report.

## export.py (once, after every worker)

The method of the [harmonization plan](../0-plans/HARMONIZATION_PLAN.md), on the NOAA-20 scale:

- **Observed months**: the first VIIRS satellite that covers the month fully: NOAA-20, else
  NOAA-21 × f21, else S-NPP × fNPP. Never summed.
- **Reconstructed months** (2000-11 → 2012-01): `R_c × F_m × fNPP × MODIS`, R_c per 0.5° cell
  (S-NPP / Terra+Aqua ratio of sums, shrunk toward the country with k = 200), F_m per calendar
  month; Terra-only months (before Aqua) × the (Terra+Aqua)/Terra factor first.
- **Fit**: months where S-NPP, Terra and Aqua are complete and archived (2012-02 → 2025).
  fNPP, f21, the Terra factor and the country ratio shrink toward the world's, so small countries
  borrow from the world.
- **Leave-one-year-out**, per area (country and each state): WAPE of the cell model, of the
  area's ratio × F_m and of a fixed ratio, bias, Spearman of yearly totals. An area where the cell
  model loses uses ratio × F_m. Reconstructed months get a p10–p90 band from the held-out error
  ratios (the country's when a state has fewer than 24 held-out months); `band_coverage` checks it
  year by year.
- **Baseline**: median, mean, p25, p75 per calendar month over 2003–2025.

Files per country (`exports/<id>/`, id = slug of the FIRMS country name, e.g. `venezuela`):

| File | Content |
|---|---|
| `meta.json` | sensors (first/last/NRT days), coefficients (country and world), country score, states on fallback, sources, limitations |
| `monthly.json` | per month `source` (observed/reconstructed), `satellite`, `partial`, `provisional`; per area raw `MODIS`, `S-NPP`, `NOAA-20`, `NOAA-21` (null where the satellite has no days), `viirs_eq`, `p10`, `p90`, `modis_eq` (converted MODIS every month: the seam check against real VIIRS), baseline, score |
| `monthly_grid.json` | version 5: `cells.west/south`, and per series (`modis`, `viirs_eq`) flat columns over the cells: `count` per cell, `gap` (month minus the previous month of that cell), `value` × `scale` as integers (about 40% smaller than pairs once compressed); 0.1°, coarsened (0.2°, 0.5°, 1°, 2°) for countries over 1.5M values |
| `recent_hotspots.json` | the world's last 7 days of points, columnar (lon, lat, acquired_utc, platform, state, confidence, frp) |

Plus `exports/places.json` (id, label, ISO groups, bbox, states, first month, last day, and `version`: a hash of the four files, which the site sends as `?v=` so caches never serve old files). A `--country` run updates only its own entries.

## Running on Railway

Group **2 · process** in [`.railway/railway.ts`](../.railway/railway.ts): `prepare` and
`process-1`…`process-8`. Every service has `RAILWAY_DOCKERFILE_PATH=2-process_data/Dockerfile`,
`PROCESS_ROOT=r2://llama-masters-firms` and the R2 credentials, plus

| Service | `PROCESS_SCRIPT` | `PROCESS_ARGS` |
|---|---|---|
| `prepare` | `prepare.py` | `--threads 8 --memory 6GB` |
| `process-K` | `clean.py aggregate.py` | `--shard K/8 --threads 4 --memory 4GB` |
| `export` | `export.py` | `--threads 8 --memory 6GB` |

Run `prepare` and wait until it completes, then the eight workers, then `export`:

```sh
npx @railway/cli up --service prepare --detach
for k in 1 2 3 4 5 6 7 8; do npx @railway/cli up --service process-$k --detach; done
npx @railway/cli up --service export --detach
```

The archives and the API layer are ~11 GB, so this runs there, not on a laptop.
