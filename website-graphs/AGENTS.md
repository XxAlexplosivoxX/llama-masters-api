# Fire calendar analytics module: context for agents

Read this before changing anything in `website-graphs/`. It explains what the module is for,
where every number comes from, how the code is organized, how it connects with `website/`,
and the traps already found. Keep it current when you change behaviour.

## 1. Project and goal

- NASA Space Apps 2026, challenge "MODIS and VIIRS Hot Spots" (team Los Llama Masters). The
  challenge text and reasoning are in `../docs/CHALLENGE.md`; the data contract of the research
  pipeline in `../docs/data-contract.md`.
- Goal: a standalone analytics and visualization module (Vite + React + TS, port 5174) focused on
  the project's **harmonized MODIS + VIIRS monthly record**, seasonal curves, anomalies, rankings,
  and comparisons.
- Architecture: an embeddable bento grid (`GraphsModule`) designed to reflow using CSS container
  queries. It can run standalone or be embedded side-by-side with the map in `website/src/map/MapView.tsx`.
- Supports three data pathways:
  1. **Gridded places**: South America and 13 countries precomputed at 0.5° resolution.
  2. **Weekly research exports**: region exports from the research pipeline with sub-area breakdown.
  3. **Custom CSV upload**: client-side FIRMS CSV parsing with PapaParse and per-satellite monthly aggregation.
- Default scope: Brazil opens by default. UI text is English only.

### User rules (from the team)

- UI text is **English only**. Conversation with the user is usually in Spanish.
- Before installing a new library: explain what it is for and whether it is free; ask first. (Current deps
  are minimal: React 18, D3 scale/interpolate, Lucide, PapaParse, Tailwind v4).
- Use real FIRMS data; label any sample or synthetic data as such.
- Prioritise what can be finished in a 48 h hackathon.
- Design: functional, restrained animation, dark NASA aesthetic, **no "AI slop"** (see §8).
- Commit in small phases with clear messages; the team pushes to `main`.

### Upstream contract and dependency: `../website/`

`website-graphs` does not duplicate data computation algorithms or data files:

- **Shared pure logic**: imports `series.ts`, `data.ts`, `geo.ts`, and `types.ts` directly from
  `../website/src/lib/` via `src/lib/shared.ts`.
- **Shared public data**: `vite.config.ts` sets `publicDir: "../website/public"`, so `/data/places.json`,
  `/data/<place>/...`, and `/data/regions/...` are served directly from `website/public`.
- **Embedding contract**: `src/state.ts` provides a framework-agnostic `GraphsStore` (`createGraphsStore()`)
  emitting typed `filters` and `focus` events for host applications (such as the map).
- **Consequences**:
  - Treat exports from `website/src/lib/{series,data,geo,types}.ts` as a hard contract. Renaming or
    changing a signature or return type breaks `website-graphs`.
  - Always run `npm run check` and `npm run build` in `website-graphs/` after touching shared logic in `website/`.

## 2. Run, build, verify

Windows + PowerShell or Git Bash, Node 24, npm (no pnpm, no Python).

```sh
cd website-graphs
npm install
npm run dev          # http://localhost:5174
npm run check        # tsc --noEmit (strict)
npm run build        # tsc --noEmit && vite build -> dist/ (~294 KB gzip JS, ~24 KB CSS)
npm run preview      # preview production build
npm run data:sync    # syncs research exports into ../website/public/data/regions
npm run data:fixture # generates tiny-region fixture in ../website/public/data/regions
```

With mise from the repo root: `mise run graphs:dev`, `mise run graphs:build`.

There is no unit-test suite. Verify with `npm run check`, `npm run build`, and browser testing.
All SVG charts use native inline SVG rendered with D3 scales (no heavy chart libraries).

## 3. Data: sources and three operational modes

Everything the app shows is loaded through three pathways managed by `usePlaceData.ts`:

### 1. Gridded places (`LoadedGrid`)
- Loaded from `public/data/` (served from `../website/public/data/`):
  - `places.json`: list of countries and regions.
  - `<id>/monthly_grid.json` (`MonthlyGrid`): 0.5° cells, dense arrays for MODIS and VIIRS counts,
    monthly harmonization coefficients ($\beta_m, k_m$), and train/test evaluation scores.
  - `<id>/recent_hotspots.json` (`RecentColumns`): columnar format for the last 7 days of detections.
  - `<id>/meta.json`: summary metadata.
- Spatial filtering: `cellsIn(loaded.grid, bbox ? { label, polygon: bboxPolygon(bbox) } : null)`.
  When a bounding box is active, only cells whose center falls within the bbox are included.
- Precomputes cell values once per place for `HARMONIZED`, `MODIS`, `VIIRS`, and `MODIS_EQ`.

### 2. Weekly research exports (`LoadedWeekly`)
- Served via the Go API (`VITE_DATA_URL`) or static fallback in `public/data/regions/<id>/`.
- Files: `weekly_activity.json`, `areas.geojson`, `metadata.json`.
- Converted to monthly series via `weeklyToMonthly(loaded.weekly, platform, areaId)`.
- Supports sub-area ranking and filtering (`AreaRanking.tsx`, `AreaFilter.tsx`).

### 3. Client-side FIRMS CSV upload (`CsvPlaceData`)
- Handled in `src/lib/csv.ts` via PapaParse (`parseFirmsCsv` / `parseFirmsText`).
- Requires `acq_date` (YYYY-MM-DD) and a satellite/instrument column (`satellite`, `instrument`).
- Recognizes platforms: `Terra`, `Aqua`, `S-NPP`, `NOAA-20`, `NOAA-21`.
- `csvMonthly`: exact monthly aggregation per platform. Detects partial edge months automatically.
- Session persistence: uploads are saved to `sessionStorage` (`graphs:csv`) to survive page reloads.
- Points are retained for the Last 7 days view (`Last7Days.tsx`).

## 4. Harmonization & statistical calculations

- **Why harmonize**: Raw VIIRS detects ~3.7x more hotspots than MODIS for the same fires due to higher
  spatial resolution (375 m vs 1 km) and greater sensor sensitivity.
- **Conversion formula**:
  $$\text{MODIS} \approx k_m \cdot ((1 + \text{VIIRS})^{\beta_m} - 1)$$
  Fitted per cell and calendar month $m$ using log-log regression over the training period (2012–2019).
- **Series kinds** (`SeriesKind`):
  - `HARMONIZED` (default): MODIS alone pre-2012; average of MODIS and VIIRS-on-MODIS-scale (2012+);
    whichever has data otherwise (`harmonizedSource`).
  - `MODIS`: MODIS observations only (Terra + Aqua, 1 km).
  - `VIIRS`: Raw VIIRS observations (S-NPP, 375 m).
  - `MODIS_EQ`: VIIRS converted to the MODIS equivalent scale.
- **Baseline and climatology**:
  - Baseline years: complete years $\ge$ `baselineFrom` (MODIS 2003, VIIRS 2012), minimum 3 years
    (`MIN_BASELINE_YEARS`).
  - `baseline2012` toggle: in the toolbar, allows restricting baseline statistics to 2012+ (the VIIRS era)
    for consistent comparisons without altering the series values.
- **Seasonal curve & percentiles** (`src/lib/seasonal.ts`):
  - `seasonalBand`: Jan–Dec distribution across baseline years (excluding the focused year). Computes
    p10, median (p50), and p90.
  - `currentMonth`: strip plot comparing the most recent month with data against the same calendar month
    across all historical baseline years. Classifies relative standing ("below p10", "p10 to median",
    "median to p90", "above p90") and anomaly ($\text{value} / \text{median} - 1$).
- **Harmonization diagnostics** (`Harmonization.tsx`):
  - Displays monthly $\beta$ and $k$ curves, training/test scores (WAPE, bias, $r$), and `localCheck`
    computed on the fly for the selected bbox.

## 5. Semantics the UI must keep

- `null` = no satellite observation data; `0` = satellite observed, zero hotspots detected.
  Never fill nulls with zeros.
- Partial months: sensor start/end or edge months of an upload. Drawn dashed or flagged; excluded
  from baseline climatology and ranking.
- Provisional data: NRT records (after `provisionalFrom`). Must be flagged in tooltips, UI notes,
  and CSV export headers.
- "Hotspot" = a satellite pixel with an active fire; not a fire count, fire perimeter, or burned area.
  The UI and exports explicitly state this (`COUNT_NOTE`).
- Numeric formatting: tabular figures (`font-variant-numeric: tabular-nums`, `.num` class).

## 6. Code map (`src/`)

- `main.tsx`: Entry point. Mounts `@fontsource-variable/public-sans` and `styles.css`.
- `App.tsx`: Top-level application shell rendering `GraphsModule`.
- `GraphsModule.tsx`: Embeddable analytics module. Coordinates toolbar, loading/error states, and the
  bento grid layout.
- `state.ts`: `GraphsState` and `createGraphsStore`. Framework-agnostic store managing `placeId`,
  `areaId`, `platform`, `kind`, `range`, `focusYear`, `focusMonth`, `csv`, `bbox`, and `baseline2012`.
  Emits `filters` and `focus` events.
- `types.ts`: Type contracts. Re-exports core types from `website/src/lib/types` and defines `Platform`,
  `CsvPoint`, etc.
- `components/`
  - `Card.tsx`: Standard card container with title, subtitle, and action slot.
  - `Toolbar.tsx`: Controls bar (`PlaceSwitcher`, `AreaFilter`, satellite toggle, series kind toggle,
    `DateRange`, CSV upload trigger, 2012 baseline toggle, `ExportMenu`).
  - `KeyNumbers.tsx`: KPI cards (range total, annual average, peak month, focused year comparison).
  - `CurrentMonth.tsx`: Strip plot comparing current month against historical baseline distribution.
  - `SeasonalCurve.tsx`: SVG seasonal profile (Jan–Dec) with p10–p90 shaded band, median curve, focus
    year overlay, and interactive scrubbing.
  - `FocusMonth.tsx`: Deep-dive card for a focused month (satellite breakdown, historical rank, anomaly).
  - `Harmonization.tsx`: Diagnostic card showing monthly coefficients, train/test WAPE, and local check.
  - `Last7Days.tsx`: Daily breakdown of recent hotspots (MODIS vs VIIRS on MODIS scale).
  - `Calendar.tsx`: Year $\times$ month heatmap matrix using Firefly square-root color ramp. Click to focus
    a year or month.
  - `YearsRanked.tsx`: Bar chart ranking complete years by total hotspot count against the average year.
  - `AreaRanking.tsx`: Horizontal bar chart ranking sub-areas in weekly research exports.
  - `DateRange.tsx`: Month range selector with presets (all, 5y, 10y, fire season).
  - `ExportMenu.tsx`: Export dropdown (Monthly CSV with `#` metadata header, standalone SVG with caption).
  - `PlaceSwitcher.tsx`, `AreaFilter.tsx`, `Ramp.tsx`.
- `hooks/`
  - `useGraphsStore.ts`: React hook to subscribe to `GraphsStore`.
  - `usePlaceData.ts`: Core data orchestration hook. Manages loading, caching, spatial filtering,
    series computation, stats, and harmonization results.
  - `useWidth.ts`: ResizeObserver hook for dynamic SVG dimensions without layout thrashing.
- `lib/`
  - `shared.ts`: Single façade importing pure domain logic from `../../website/src/lib/`.
  - `chart.ts`: SVG tokens (`TICK`, `AXIS`, `VALUE`, `NOTE`), tick formatting (`fmtTick`), and tick thinning (`thinBy`).
  - `color.ts`: Color palette constants, `fireflyScale` (sqrt ramp), `anomalyScale` (diverging ramp),
    `SERIES_COLOR`, `SENSOR`.
  - `seasonal.ts`: Percentile calculation, `seasonalBand`, `currentMonth` diagnostics, and `medianYear`.
  - `csv.ts`: PapaParse wrapper, CSV validation, platform normalization, `csvMonthly` aggregation.
  - `export.ts`: `downloadMonthlyCsv` (with `#` metadata header), `monthlyCsvRows`, `downloadSvg`.
  - `format.ts`: Number and date formatters.
- `scripts/`
  - `sync-data.mjs`: Syncs research weekly exports to `../website/public/data/regions`.
  - `make-fixture.mjs`: Generates `tiny-region` fixture for local testing.

## 7. Embedding contract & container queries

`GraphsModule` is designed for dual deployment: standalone app or embedded next to the map.

- **Container Queries**:
  The root container uses `container-type: inline-size; container-name: graphs`.
  - `< 640px`: 1 column.
  - `640px – 1100px`: 6 columns (`.bento-kpi` spans 4).
  - `$\ge$ 1100px`: 12-column bento grid. Cards span across 4, 5, 7, 8, or 12 columns.
- **Store & Event Coupling**:
  - Host applications can instantiate `createGraphsStore(initial)` and pass it via the `store` prop.
  - `store.actions.setBbox([west, south, east, north] | null)`: restricts grid calculations to the selected area.
  - `store.on("focus", ({ year, month }) => ...)`: notifies the host app when the user focuses a year or month.
  - `store.on("filters", ({ placeId, areaId, platform, kind, from, to, bbox }) => ...)`: notifies host app of filter changes.

## 8. Design system and anti-slop rules

- **Palette** (`@theme` in `styles.css`, mirrored in `lib/color.ts`):
  - Background `#060D1E`, card `#0B1631`, grid border `#1E293B`, text `#E2E8F0`, muted `#94A3B8`, alert `#F59E0B`.
  - Satellites / Instruments: MODIS `#2E96F5`, VIIRS `#E43700`, Aqua `#38BDF8`, NOAA-20 `#FB923C`, NOAA-21 `#FDBA74`.
  - Firefly heat ramp: `#111C35` $\rightarrow$ `#6B1D1B` $\rightarrow$ `#E43700` $\rightarrow$ `#FF8A00` $\rightarrow$ `#FFE66D` (square-root scale).
  - Anomaly ramp: `#2C7BB6` $\rightarrow$ `#ABD9E9` $\rightarrow$ `#D9DEE8` $\rightarrow$ `#FDAE61` $\rightarrow$ `#D7191C` (diverging, clamped).
- **Anti-slop guidelines**:
  - Direct SVG rendering with D3 scales — no generic chart libraries or canvas bloat.
  - One meaning per colour: heat ramp = hotspot counts; blue-red = anomaly vs average only; amber/cyan = MODIS/VIIRS.
  - No decorative gradients, no cards inside cards, no counter animations, no emoji in UI text.
  - Respect `prefers-reduced-motion`.
  - Standalone SVG exports include a solid background and an informative caption with data provenance.

## 9. Performance & lessons learned

- **SVG text collisions**: Use `thinBy(slotPx, labelPx)` in `chart.ts` so year and month tick labels
  automatically thin on narrow containers instead of colliding.
- **Session storage quota**: When saving uploaded CSVs to `sessionStorage`, wrap in `try/catch`.
  Large CSV files (>5 MB) exceed browser storage quotas.
- **Memoization**: `usePlaceData` heavily memoizes cell index calculations, series reductions, and stats.
  Scrubbing focus years or hovering months re-renders only lightweight SVG overlays.
- **Contract testing**: Whenever modifying shared logic in `website/src/lib/`, always run `npm run check`
  in `website-graphs/` to verify type compatibility.

## 10. Known limits and open work

- CSV uploads lack spatial grid definitions: uploads calculate monthly platform totals and last 7 days
  points, but cannot compute cell-level harmonization coefficients (shown as raw counts).
- Sub-area filtering in weekly research exports is limited to polygons pre-defined in `areas.geojson`.
- Future integration: wire bidirectional interaction with `website/src/map/MapView.tsx` (e.g., bounding
  box drawing on the map dynamically updates `bbox` in `GraphsStore`).
