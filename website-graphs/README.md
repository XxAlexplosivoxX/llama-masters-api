# website-graphs

Standalone Vite + React + TS analytics module for NASA FIRMS hotspot data, focused on the
project's **harmonized MODIS + VIIRS monthly record**. It computes numbers the same way as
`website/` — by importing `website/src/lib/{series,data,geo,types}.ts` directly — so figures
are identical. Later it embeds next to `website/src/map/MapView.tsx`.

## Run

```sh
npm install
npm run dev            # http://localhost:5174
```

`npm run check` type-checks, `npm run build` builds. From the repo root:
`mise run graphs:dev` / `graphs:build`.

## Data

Served from `website/public` (vite `publicDir`), so `/data/places.json`,
`/data/<place>/{monthly_grid,recent_hotspots,meta}.json` and `/data/regions/*` behave
exactly as in the website:

- **Grid places** (South America + countries): harmonized record by default, switchable
  to MODIS-only or VIIRS-only. `VITE_DATA_URL` (see `.env.example`) is only used for the
  weekly research exports, with the same API → static fallback the website has.
- **Weekly research exports**: per-area, per-satellite series via `weeklyToMonthly`.
- **CSV upload**: a FIRMS file produces exact per-platform monthly series (edge months
  partial) and a "last 7 days" point view; persisted in `sessionStorage` (`graphs:csv`).

`npm run data:fixture` / `data:sync` write weekly exports into `website/public/data/regions/`
(git-ignored by the website).

## Embedding contract

- `state.ts` exposes `createGraphsStore()` — a framework-agnostic store with `subscribe`
  plus typed `filters` (`{placeId, areaId, platform, kind, from, to}` as `YYYY-MM`) and
  `focus` (`{year, month}`) events for the future map coupling. `GraphsModule` accepts
  `store` and `data` (a `usePlaceData` result) props.
- `GraphsModule`'s root is a CSS container (`container-name: graphs`); its bento grid
  uses container queries, so it reflows the same at any host width.
