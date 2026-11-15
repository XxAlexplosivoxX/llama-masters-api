# 3. API

Read-only HTTP API over the exports that [`2-process_data`](../2-process_data/README.md) writes
to `exports/` in R2. [Hono](https://hono.dev) app that runs on **Cloudflare Workers** (R2 binding)
and locally on **Bun** (a folder). Every route maps to one file: nothing is computed per request,
so responses cache at the edge and the Worker stays tiny (~17 KB gzipped).

**Live:** <https://llama-masters-api.esauflores.com/v1/places> (also
`https://llama-masters-api.redesinformaticas.workers.dev`).

## Routes

Places are countries (id = slug of the FIRMS country name, e.g. `venezuela`), one set of files each. No bbox or other
query filters: the website slices months, states and drawn areas in the browser.

| Route | File in R2 | Cache |
|---|---|---|
| `GET /v1/places` | `exports/places.json` | 1 h |
| `GET /v1/places/:id` (or `/meta`) | `exports/<id>/meta.json` | 1 h |
| `GET /v1/places/:id/monthly` | `exports/<id>/monthly.json`: per sensor and harmonized (NOAA-20 scale, p10–p90), country and states | 1 h |
| `GET /v1/places/:id/grid` | `exports/<id>/monthly_grid.json`: raw MODIS and the harmonized record per cell, 0.1° (coarser for the largest countries) | 1 h |
| `GET /v1/places/:id/recent` | `exports/<id>/recent_hotspots.json`: last 7 days of points | 10 min |
| `GET /healthz` | | |

- **Ids** match `[a-z0-9]+(-[a-z0-9]+)*`; anything else is `404`, so a request can never name
  another key in the bucket.
- **Caching:** `ETag` on every file (R2's, or size + mtime locally), `If-None-Match` → `304`;
  on Workers, `200` responses are kept in the edge cache (`caches.default`).
- **CORS:** any origin, `GET`/`HEAD` only. Public data, no auth.

## Run

```sh
bun install                 # bunfig.toml: exact versions, only releases at least 1 day old
bun run dev                 # http://localhost:8787, serving fixture/ (synthetic)
DATA_DIR=/path/to/folder bun run start   # a folder holding exports/
bun test                    # routes, 304s, unsafe ids, R2 store
bun run check               # tsc -b: types for Bun and for Workers
```

From the repository root: `mise run api:dev`, `mise run api:test`, `mise run api:check`.

## Deploy (Cloudflare)

```sh
bunx wrangler login
bun run worker:dev          # local Workers runtime
bun run deploy              # builds ../4-web, then wrangler deploy
```

The same Worker serves the website: `[assets]` points at `../4-web/dist`, and Cloudflare serves those
files without running the Worker; only `/v1/*` and `/healthz` run it. Addresses: `workers.dev`,
`llama-masters.esauflores.com` (site) and `llama-masters-api.esauflores.com` (API); Cloudflare creates
their DNS records and certificates.

Caching: `/v1/places` for 60 s; place files requested with `?v=<version>` (from `places.json`, a hash
of the files) for a year, without it for 5 min. A new export is live within a minute.

`wrangler.toml` binds `BUCKET` to `llama-masters-firms`; the Worker reads with the binding, so
there are no credentials in code or variables. Telemetry is off (`send_metrics = false`).

## Layout

| Path | Role |
|---|---|
| `src/app.ts` | Routes, id check, headers (shared by both runtimes) |
| `src/store.ts` | Store interface and the R2 store |
| `src/file-store.ts` | Folder store (Bun server, tests) |
| `src/worker.ts` | Workers entry with the edge cache |
| `src/server.ts` | Bun entry |
| `tsconfig.json` | Points editors and `tsc -b` to `tsconfig.bun.json` (Bun types) and `tsconfig.worker.json` (Workers types) |
| `fixture/exports/` | Synthetic files in the export shapes (not real observations) |

`fixture/` only fixes the shapes the routes return; [`export.py`](../2-process_data/README.md#exportpy-once-after-every-worker) (step 2) writes the real files.
