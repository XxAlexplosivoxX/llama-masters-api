# llama-masters-api

Go API for the burning-activity exports produced by
[llama-masters-research](https://github.com/esauflores/llama-masters-research)
(`scripts/prepare_region.py` → `data/processed/<region>/`). Prepared regions are
**uploaded** to the API, stored in SQLite, and served with filtering and caching.

To read the data (curl, pandas, field meanings, the team's base URL), see the
[usage guide](docs/usage.md). The [data contract](docs/data-contract.md) describes
what the API accepts. The
[challenge, plans and references](docs/README.md) are copied from the research repo.

## Quick start

```sh
mise install                      # Go 1.27.4
cp .env.example .env              # then set API_TOKEN (openssl rand -hex 32)
mise run dev                      # http://localhost:8080
mise run push -- --dir ../llama-masters-research/data/processed/americas-2026-10
curl 'localhost:8080/v1/regions/americas-2026-10/weekly?platform=NOAA-20'
```

`mise run test`, `mise run vet` and `mise run build` (static binary in `bin/`) cover
the rest. With Docker:

```sh
docker build -t llama-api .
docker run -p 8080:8080 -e API_TOKEN=... -v llama-data:/data llama-api
```

## Uploading

`PUT /v1/regions/{name}` with `Authorization: Bearer $API_TOKEN` and multipart parts
named after the export files:

| Part | File | Required |
|---|---|---|
| `metadata` | `metadata.json` | yes |
| `areas` | `areas.geojson` | yes |
| `weekly` | `weekly_activity.json` | yes |
| `hotspots` | `hotspots.geojson` | no |

```sh
curl -X PUT -H "Authorization: Bearer $API_TOKEN" \
  -F metadata=@metadata.json -F areas=@areas.geojson \
  -F weekly=@weekly_activity.json -F hotspots=@hotspots.geojson \
  localhost:8080/v1/regions/americas-2026-10
```

`llama-api push --dir FOLDER [--name NAME] [--url URL]` does the same while streaming
the files. Region names use `[a-z0-9_-]`; by default `push` uses the folder's name.

**What the server checks.** Every part is validated against the export contract before
anything is stored. An invalid upload gets `422` with the full list of problems, and
the region keeps its previous version. The rules:
- known platforms, and instruments that match them;
- Monday week starts, and `week_end`/`iso_week` consistent with `week_start`;
- `reported_detections` is `null` exactly when `source_days` is 0, so "no source data" never becomes 0;
- every `area_id` referenced exists;
- coordinates are in range.

**Versions.** Each upload creates a new version, made current atomically; the server
keeps the last `KEEP_VERSIONS`. `DELETE /v1/regions/{name}` removes a region.

## Reading

The [usage guide](docs/usage.md) has examples and the rules for interpreting the
numbers.

| Route | Returns |
|---|---|
| `GET /v1/regions` | Prepared regions (same shape as `index.json`, plus `version`) |
| `GET /v1/regions/{name}` | Version, upload time, SHA-256 and the original metadata |
| `GET /v1/regions/{name}/areas` | Areas as GeoJSON |
| `GET /v1/regions/{name}/weekly` | Weekly rows; filters `area_id`, `platform`, `from`, `to` (on `week_start`) |
| `GET /v1/regions/{name}/hotspots` | Points as GeoJSON, newest first; filters `platform`, `day`, `from`, `to`, `bbox=w,s,e,n`, `area_id`, `limit` |
| `GET /healthz`, `GET /debug/cache` | Health check, cache hit/miss counters |

**Hotspot limit.** Hotspots return at most `HOTSPOT_LIMIT_DEFAULT` points, or `limit`
up to `HOTSPOT_LIMIT_MAX`. `X-Truncated: true` says more points matched.

**Compatibility routes.** `/index.json` and `/{name}/metadata.json`, `areas.geojson`,
`weekly_activity.json` and `hotspots.geojson` mirror the research repo's
`data/processed/` layout. Its app can therefore use the API by changing only its
data base URL.

## Caching

- **Server cache.** Responses are cached in memory (LRU of `CACHE_MAX_ENTRIES` for
  `CACHE_TTL`). Keys include the region version, so an upload is visible immediately;
  uploads and deletes also purge that region's entries. Bodies above
  `CACHE_MAX_ITEM_MB` are served but not cached. Concurrent misses for the same
  response are built once.
- **HTTP caching.**
  - Responses carry an `ETag`, `Cache-Control: public, max-age=CACHE_HTTP_MAX_AGE`
    and `Vary: Accept-Encoding`.
  - `If-None-Match` gets `304`.
  - Bodies are served gzip-compressed when the client accepts it; the compressed
    copy is cached alongside the original.
- **Debugging.** `X-Cache: HIT|MISS` shows which path a response took.

## Configuration

Environment variables (see `.env.example`):
- `ADDR`, `DB_PATH`, `API_TOKEN`, `CORS_ORIGINS`
- `CACHE_MAX_ENTRIES`, `CACHE_TTL`, `CACHE_MAX_ITEM_MB`, `CACHE_HTTP_MAX_AGE`
- `MAX_UPLOAD_MB`, `KEEP_VERSIONS`
- `HOTSPOT_LIMIT_DEFAULT`, `HOTSPOT_LIMIT_MAX`

Without `API_TOKEN`, the API serves reads only.

## Layout

| Path | Role |
|---|---|
| `cmd/llama-api` | `serve` and `push` subcommands |
| `internal/contract` | Export types and validation |
| `internal/store` | SQLite storage and embedded migrations |
| `internal/cache` | Response cache, ETag and gzip |
| `internal/api` | Routes, ingest, middleware (auth, CORS, logging) |
| `internal/push` | Streaming multipart upload client |
| `testdata/tiny-region` | Synthetic fixture used by the tests (not real observations) |
| `docs/` | Data contract, challenge, plans and references |
| `website/` | Static web app (fire calendar); see [`website/README.md`](website/README.md) |

The data are raw satellite hotspot detections, not unique fires or burned area, and
platforms are not harmonized; the uploaded `metadata.json` (served unchanged) states
the method and limitations.
