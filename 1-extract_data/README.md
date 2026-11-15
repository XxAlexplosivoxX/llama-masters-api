# 1. Extract data

NASA FIRMS hotspots → the `raw/` Parquet layer in Cloudflare R2 (`r2://llama-masters-firms/raw`).
Rows keep NASA's columns, unfiltered; cleaning is the next step.

| Script | What it does |
|---|---|
| `src/archives.py` | Yearly country archives (MODIS 2000→, S-NPP 2012→, NOAA-20 2018→, up to the last full year) → `raw/sensor=<s>/country=<C>/part.parquet`. No key needed. |
| `src/api.py` | Area API, whole world → `raw/sensor=<s>/source=api/month=YYYY-MM/part.parquet`. NOAA-21 (API only) and the current year for every sensor. Fetches only changed days; safe to rerun daily. |
| `src/verify_archives.py` | Checks the archive layer against NASA's index (coverage, years, density). `--spot N` adds exact row counts against N NASA CSVs, which downloads them: use it on Railway. |
| `src/common.py` | Shared pieces: typed columns, DuckDB/R2 connection, "already written?" check, Parquet writer, `--shard`. |
| `Dockerfile`, `Dockerfile.dockerignore` | Image for the Railway jobs; `EXTRACT_SCRIPT` picks the script. |

## Running on Railway (not on a laptop: the world archive is ~50 GB of CSV)

Services `extract-1` … `extract-4`, one per worker (worker K = shard K = key K). Variables on each:

- `RAILWAY_DOCKERFILE_PATH=1-extract_data/Dockerfile`
- `EXTRACT_SCRIPT=api.py` (or `archives.py`), `EXTRACT_DEST=r2://llama-masters-firms/raw`
- `EXTRACT_ARGS`, e.g. `--sensors modis,viirs-snpp,viirs-jpss1,viirs-jpss2 --start 2026-01-01 --shard K/4`
- `FIRMS_MAP_KEY` (worker K uses `FIRMS_MAP_KEY_K` from `.env`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

Deploy with `npx -y @railway/cli@5.74.0 up --service <name> --detach`. Each FIRMS key allows
5,000 transactions per 10 minutes (one world-day ≈ 40), so the API job's speed scales with the
number of keys, one per worker. Reruns skip what is already in R2.
