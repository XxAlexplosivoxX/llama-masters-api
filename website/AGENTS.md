# Fire calendar website: context for agents

Read this before changing anything in `website/`. It explains what the app is for, where every
number comes from, how the code is organised, and the traps already found. Keep it current when
you change behaviour.

## 1. Project and goal

- NASA Space Apps 2026, challenge "MODIS and VIIRS Hot Spots" (team Los Llama Masters). The
  challenge text and reasoning are in `../docs/CHALLENGE.md`; the data contract of the separate
  research pipeline in `../docs/data-contract.md`.
- Goal: a **harmonized burning-activity calendar**. MODIS (2000 onward) and VIIRS (2012 onward)
  hotspot records are made comparable so "the sensor of origin no longer matters", and a web app
  lets a user pick an area and dates, see when it burns, which years burned more, how now compares,
  and download CSVs. Audience: emergency managers, land managers, firefighters, scientists.
- MVP scope: **South America, Brazil first** (Brazil opens by default). Other continents are
  "Coming soon" entries only.
- The repo root (`llama-masters-api`) also has a Go API (`../cmd`, `../internal`) that serves weekly
  region exports from the research pipeline. The website does **not** need it; it is optional
  (`VITE_DATA_URL`). Work in `website/` unless the user asks for backend changes; if a backend
  change would help, propose it instead of doing it.

### User rules (from the team)

- UI text is **English only**. Conversation with the user is usually in Spanish.
- Before installing a new library: explain what it is for and whether it is free; ask.
- Use real FIRMS data; label any sample or synthetic data as such.
- Prioritise what can be finished in a 48 h hackathon.
- Design: functional, not overloaded, polished but restrained animation, **no "AI slop"** (see §7).
- Never commit secrets. `FIRMS_MAP_KEY` lives only in `website/.env.local` (git-ignored).
- Commit in small phases with clear messages; the team pushes to `main`.

### Sibling app: `../website-graphs/` (owned by a teammate)

A standalone analytics module (Vite + React, port 5174) that will later sit next to the map. It
**imports `website/src/lib/{series,data,geo,types}.ts` directly** (see
`website-graphs/src/lib/shared.ts`) and serves `website/public` as its public dir, so its numbers
match the website exactly. Consequences:

- Treat the exports of `series.ts`, `data.ts`, `geo.ts`, `types.ts` and the files in
  `public/data/` as a shared contract. Renaming or changing a signature or file format breaks
  `website-graphs`. After such a change, run `npx tsc --noEmit` in `../website-graphs` using its
  installed dependencies.
- Do not edit `website-graphs/` unless asked; coordinate with its owner.

## 2. Run, build, verify

Windows + PowerShell or Git Bash, Node 24, npm (no pnpm, no Python).

```sh
cd website
npm install
npm run dev          # http://localhost:5173
npm run check        # tsc --noEmit (strict)
npm run build        # tsc + vite build -> dist/  (~480 KB gzip JS, mostly MapLibre)
```

With mise from the repo root: `mise run web:dev`, `mise run web:build`, `mise run web:data`.

There is no unit-test suite. Verify with `npm run check`, `npm run build`, and the browser. Headless
Edge works for screenshots and profiling (`msedge --headless=new --use-angle=swiftshader
--enable-unsafe-swiftshader --screenshot=... --window-size=1440,900`); a small CDP driver that can
click, evaluate JS, screenshot and CPU-profile was used during development (not committed). In DEV
the MapLibre map is exposed as `window.__map` for debugging.

Deploy: static site. Vercel/Netlify root `website/`, build `npm run build`, output `dist/`.
`VITE_DATA_URL` optional.

## 3. Data: where it comes from and what is stored

Gridded history and recent points are precomputed by **`scripts/build-country.mjs`** and committed
under `public/data/`. Version-3 sizes await regeneration. The browser never calls NASA.

### Sources

| Source | Content | Period | Key |
| --- | --- | --- | --- |
| FIRMS yearly country archive `data/country/modis/<y>/modis_<y>_<Country>.csv` | MODIS C6.1 Terra+Aqua, 1 km | 2000-11 to 2025 | none |
| FIRMS yearly country archive `data/country/viirs-snpp/<y>/...` | VIIRS S-NPP C2, 375 m | 2012-01-20 to 2025 | none |
| FIRMS area API `api/area/csv/<KEY>/<SOURCE>/<bbox>/<1..5 days>/<date>` | current year; `*_SP` (standard) while released, then `*_NRT` (provisional) | 2026 to today | `FIRMS_MAP_KEY` |
| FIRMS 7-day global feeds `data/active_fire/.../*_Global_7d.csv` | MODIS, S-NPP, NOAA-20, NOAA-21 NRT points | last 7 days | none |

There is no country archive for NOAA-20/21, so history uses S-NPP; NOAA-20/21 appear only in the
last 7 days. `api/data_availability/csv/<KEY>/all` tells where SP ends and NRT begins.

### Processing (per country)

1. Quality: MODIS confidence >= 30; VIIRS confidence not `l`; `type == 0` where present (NRT files
   have no `type`, so a few static industrial sources may remain; documented as a limitation).
2. Aggregate to **0.1° cells x calendar months (UTC)**, separately for MODIS and VIIRS. Points are
   not kept for history.
3. Country clipping: archives are clipped by NASA. API and 7-day data are bbox requests, so they are
   filtered by a 0.1° footprint built from every archive point of that country.
4. Harmonization fit (see §4), trained 2012-2019, tested 2020-2025.
5. Caches per sensor-year and per API chunk in `.cache/<id>/cell-<CELL>/` (git-ignored), currently
   `cell-0.1`. Both cache kinds are keyed by cell size; old unversioned aggregates are never reused.
   The footprint mask uses the independent `FINE = 0.1` resolution. A Brazil first build streams
   ~2.5 GB; changing cell size requires fresh downloads, then reruns reuse that resolution's caches.
6. `--region south-america` sums the already-built country grids (border cells add up correctly
   because each archive is clipped to its country), refits, and concatenates the 7-day points.
   It requires version-3 sparse country grids with the current `CELL`; stale grids fail clearly.

API limits: 1-5 days per request; 5,000 transactions per 10 minutes. The script waits 10 minutes
when it sees "Exceeding allowed transaction limit" and resumes.

Commands:

```sh
npm run data:brazil
npm run data:country -- --country peru              # see COUNTRIES in the script
npm run data:country -- --country brazil --no-api   # archives only, no key
npm run data:country -- --region south-america      # after all 13 countries
npm run data:sync                                   # optional: research weekly exports -> public/data/regions (git-ignored)
```

### Files the app loads (`public/data/`)

- `places.json`: `[{ id, kind: "region"|"country", label, bbox, base, history, hotspots }]`, order:
  regions, Brazil, then A-Z.
- `<id>/monthly_grid.json` (`MonthlyGrid` in `src/lib/types.ts`, `version: 3`):
  - `start_month` "2000-01", `months` (index 0 = Jan 2000, through Dec of the current year)
  - `cell_deg` 0.1 (about 11 km north–south)
  - `sensors.MODIS|VIIRS`: `first_source_day`, `last_source_day`, `provisional_from_day`,
    `baseline_from_year` (MODIS 2003, VIIRS 2012), `baseline_note`, `quality_rules`,
    `quality_counts`, `processing`
  - `harmonization`: `coefficients[12] {month, beta, k, pairs}`, `train`/`test` scores
    (`model`, `single_ratio`, `raw_viirs` each `{wape, bias, r}`), `method`, `caveats`
  - `cells: [west, south, modisSparse, viirsSparse][]`; each sensor stores flat
    `[monthIndex, count, ...]` pairs in ascending month order, only for nonzero counts.
    `[]` means all counts are zero; sensor coverage still determines no-data (`null`) months.
    `cellValues` expands counts once per place into the existing dense series API shared with
    `website-graphs`; coverage, partial-month and provisional semantics remain unchanged.
- `<id>/recent_hotspots.json` (`RecentColumns`): columnar arrays `lon, lat, acquired_utc, platform
  (index into platforms), confidence (1 nominal, 2 high), frp, daynight (1 day)`.
- `<id>/meta.json`: summary.
- `regions/` (optional, git-ignored): weekly research exports, shown as "Weekly research exports".

Built: Brazil, Argentina, Bolivia, Chile, Colombia, Ecuador, French Guiana, Guyana, Paraguay, Peru,
Suriname, Uruguay, Venezuela, and `south-america`.
The committed version-2 grids must be regenerated country by country, then region by region.
The loader rejects version 2 with an explicit regeneration error; it does not reinterpret dense arrays.

## 4. Harmonization (the scientific core)

- Raw VIIRS reports ~3.7x more hotspots than MODIS for the same fires (smaller pixels, more
  sensitive), so raw counts are never mixed.
- **VIIRS on the MODIS scale** per cell and calendar month m:
  `MODIS ≈ k_m · ((1 + VIIRS)^β_m − 1)`; β_m is the log-log slope over train cell-months where
  VIIRS > 0 (β < 1 captures saturation), k_m makes train totals match. VIIRS = 0 maps to 0.
  Applied **per cell, then summed** (`modisEquivalent`, `cellValues` in `src/lib/series.ts`).
- **Harmonized record (default view)**: MODIS alone where only MODIS fully covers a month (before
  2012); the mean of MODIS and VIIRS-on-MODIS-scale where both fully cover it; whichever has data
  otherwise (`harmonizedSource`). If either satellite stops, the record continues.
- Legacy version-2 held-out test 2020-2025, monthly WAPE vs real MODIS: Brazil 10.0 % (single fixed ratio 10.6 %,
  raw VIIRS 270 %); South America 8.9 % (single ratio **8.2 %, slightly better**; the UI says so).
  Version-3 coefficients and scores must be refitted on the finer cells during regeneration.
  Caveats: MODIS is not ground truth; Terra/Aqua orbits drifted after ~2020/2022.
- `localCheck` recomputes the test for any selected area; the panel shows it.

## 5. Semantics the UI must keep

- `null` = no source data (hatched), `0` = observed, no hotspots. Never fill nulls with zeros.
- Partial months (sensor starts or ends mid-month) are dashed and excluded from averages and ranks.
- Provisional = NRT data (after `provisional_from_day`); flagged in text and CSV.
- Averages (climatology) use complete years >= `baselineFrom`, minimum 3 years
  (`MIN_BASELINE_YEARS`). Earlier complete years are shown faded and not ranked.
- Current calendar month to date uses the selected area's sensor view and its actual source-day
  cutoff (including the actual contributing sensor in the harmonized view). It is independent of
  the selected date range and explicitly flags when outside it. Compare the available count with
  the full-month arithmetic MEAN, not median, over at least 3 complete baseline years before the
  current year. This is a share of a full-month mean, not a same-day anomaly or daily pace estimate:
  daily historical totals are unavailable. Missing data, late-start coverage, insufficient baseline,
  a zero mean and approximate weekly exports have explicit explanations. Keep this separate from
  the complete-year versus annual-mean figure.
- Fire season = the 3 consecutive months with the largest share of the average year.
- "Last 7 days vs a typical week" uses MODIS points only (the record is on the MODIS scale):
  `climatology[month] / daysInMonth * 7`. Hidden for the VIIRS-only view.
- "Hotspot" = a satellite pixel with an active fire; not a fire count or burned area. Say
  "hotspots" in the UI, not "detections" or "fires".
- Weekly research exports: ISO week → month of its Thursday; flagged approximate.
  Places use the index entry's `bbox` when supplied, otherwise worldwide `[-180, -90, 180, 90]`
  (including the API's `world` region). API hotspot requests send the selection bbox, or the place
  bbox when there is no selection.

## 6. Code map (`src/`)

- `main.tsx`: imports MapLibre CSS **before** `styles.css` (otherwise MapLibre's popup CSS wins and
  popups turn white), fonts, `MotionConfig reducedMotion="user"`.
- `App.tsx`: layout. Desktop (>= 1024 px): map + 440 px side panel. Mobile: full map + Vaul drawer
  (snaps `168px`, `0.55`, `1`). Owns `layer` (history | recent), `drawMode`, drawer `snap`, the
  `play` action (switch to history, start playback, fold the drawer on mobile). Desktop bottom bar =
  legend + timeline (wraps on narrow maps); on mobile they float above the drawer's measured top.
  The drawer scroll viewport follows its visible height at every snap; only the accessible Vaul
  handle drags/snaps it. The legend and zoom controls remain above the folded and half-height drawer;
  at full height the panel supplies the calendar legend and map controls are hidden.
  Desktop Charts starts collapsed in a bottom dock within the map column; opening it shrinks
  the map (its existing ResizeObserver calls engine.resize). Legend/player stay in the map area.
- `state.ts` → `useExplorer()`: the single app state. Places, current place, `loaded`, `status`
  (with byte progress), `shape` (selection), `kind` (`HARMONIZED` | `MODIS` | `VIIRS` |
  `MODIS_EQ`), `range`, `focus` year, `hoverMonth`, playback (`playing`, `speed`, `timelineOpen`,
  `play/pause/seek/stopPlayback`), 7-day sensor toggles. Derived: per-cell `values` for all kinds
  (computed once per place), `cells` in the selection, `series`, `stats`, `harmonization`
  (local check + annual comparison), `recentInArea`, `recent` (after toggles), `selectionLabel`.
  Playback has a separate clamped cursor; `hoverMonth` exposes the played month while running.
  Pause, close, date-range changes and switching map layers clear hover and restore range totals
  and the range color scale. Seeking previews the chosen month on the map and moves the resume
  cursor; explicit pause/close still restore range totals. Switching to Last 7 days pauses playback
  and disables calendar/chart map hovers. The panel's map-month row follows playback, seeking and
  in-range hover with the map's null/zero semantics; the annual comparison remains distinct.
- `lib/`
  - `types.ts`: all data shapes.
  - `data.ts`: `loadPlaces` (places.json + optional API/static weekly regions), `loadPlace`
    (streams with byte progress), `fetchHotspots` (API with bbox + `X-Truncated`), `COMING_SOON`.
  - `series.ts`: `cellsIn`, `cellValues`, `harmonizedSource`, `coverage`, `gridSeries`,
    `computeStats`, `rankOf`, `localCheck`, `annualComparison`, `weeklyToMonthly`.
  - `currentMonth.ts`: month-to-date comparison and source-cutoff explanations; consumes the shared
    series contract without changing its exports or data formats.
  - `seasonal.ts`: focus-excluding seasonal percentiles, latest complete month versus earlier
    complete baseline years, complete annual totals and compact chart ticks.
  - `color.ts`: `HEAT` (magma), `ANOM` (blue-red), `SENSOR` colours, `sensorOf`.
  - `validate.ts`: coordinate parsing (`-9.5`, `9,5 S`, `55.5°W`, U+2212), ranges, bbox overlap.
  - `geo.ts`, `format.ts`, `csv.ts` (monthly CSV includes harmonized, MODIS, VIIRS, VIIRS-on-MODIS
    columns and provisional flags; hotspot CSV).
- `map/`
  - `engine.ts` (`MapEngine`): MapLibre globe, OpenFreeMap dark style with offline fallback,
    thinned basemap labels with subdued state/city text and halos set once, `minZoom` 1.7. Sources/layers: `grid` (fill; colour from
    **feature-state** `v`), `recent-heat` + `recent-dots` (circles; colour by sensor, size by FRP,
    MODIS ordered last to draw on top), `mask`, `areas`, `outline`. TerraDraw rectangle/polygon
    (polygon refuses self-intersection). `setGridCells` (geometry once per place/selection; grid
    hidden until tiled), `setGridValues` (feature-state per cell; paint only when the scale
    changes), `setRecent`, `setLayer`, `setSelection`, `fit`, `intro` (fly + fade in history),
    `skipIntro`. Every public method checks `destroyed`.
  - `MapView.tsx`: wires state to the engine. Shown cells = selection only; values = total over
    the range, or one month (hover/playback) with **one fixed monthly scale** (98th percentile of
    cell-months in range). Load card, captions.
  - `MapStatus.tsx`: `LoadingCard` (basemap / history / 7 days with real MB), `MapCaption`.
- `components/`
  - `Toolbar.tsx`: `PlaceSwitcher` (Region / Countries / Weekly exports / Coming soon),
    `DrawTools` (Rectangle, Shape, Coordinates; mutually exclusive; coordinate form with Point and
    Box tabs and per-field validation; on phones popovers become a sheet and the drawer folds),
    `SelectionChip` (area label + Clear), `LayerSwitch`.
  - `Panel.tsx`: order = header → `DateRange` → `KeyNumbers` → "When does it burn?" (`Calendar`)
    → "Which years burned more?" (`Anomalies`) → "What is burning now?" (`Recent`) → Download
    (`Export`) → "How MODIS and VIIRS are combined" (`Sensors.HowCombined`, with the single-sensor
    switch) → About this data. Mobile inserts Charts after Anomalies; desktop uses the map dock.
  - `Calendar.tsx`: SVG years x months; memoised `Cell`s; hover shows the month on the map, drag
    sets the range, click a year to focus it; tooltip anchors to its side at the edges. Pointer
    selection handles capture, cancellation and clamped endpoints. Touch keeps vertical scrolling
    by default; "Drag to select dates" enables dragging between rows. Arrow keys navigate,
    Shift+arrows select, Enter focuses a year and Escape cancels. Partial-cell accessible names
    include "partial month".
  - `Timeline.tsx`: radar-style playback (4 months/s at 1×; 0.5×/1×/2×/4×, so 0.5× is 500 ms/month),
    scrubber, loops with a short hold at the end. Responsive player rows keep all four speeds visible.
  - `DateRange.tsx` (custom month picker + presets), `KeyNumbers.tsx`, `Anomalies.tsx`,
    `Recent.tsx`, `Export.tsx`, `Legend.tsx`, `Sensors.tsx`, `ErrorBoundary.tsx`.
- `hooks/useDismiss.ts`: outside-click / Escape to close popovers.
- `components/charts/`: shared accessible tabs with seasonal, latest-complete-month and sensor
  SVG charts; weekly exports show the first two with approximate labels. Sensor monthly totals
  are memoised by loaded place/values/cells; annual comparison uses complete years within dates.
- `hooks/useWidth.ts`: ResizeObserver width for responsive chart axes.
- `hooks/useDrawerViewport.ts`: measures the visible drawer during snap/drag/resize transitions,
  sizing the scroll area and positioning mobile map overlays without changing map layers.
- `styles.css`: Tailwind v4 `@theme` tokens and component classes (`.seg`, `.field`, `.btn`,
  `.link`), MapLibre chrome and popup restyle, timeline scrubber.

## 7. Design system and anti-slop rules

Palette (`@theme` in `styles.css`): bg `#0B0F1A`, surface `#121829`, surface-2 `#1B2338`, border
`#2A3350`, text `#E8ECF5`, muted `#9AA6C0`, nasa-blue `#0B3D91`, accent `#4C8DFF`, nasa-red
`#FC3D21`; heat ramp `#1B2338 → #3B0F70 … #FCFDBF` (magma); anomaly ramp `#2C7BB6 … #D7191C`;
sensors MODIS `#FFB547`, VIIRS `#3DD6D0`. Font: Public Sans Variable.

One meaning per colour: heat ramp = how many hotspots; blue-red = vs average only (year bars in the
calendar are neutral); amber/cyan = MODIS/VIIRS; accent blue = interactive; NASA red = the focused
year / brand dot. Lead with answers in plain language, questions as section titles, figures as
rows, not tiles. No cards inside cards, no gradients as decoration, no count-up numbers, no
uppercase micro-labels, no emoji. Every colour ramp has a legend. Respect reduced motion.

## 8. Performance rules (learned the hard way)

- In MapLibre, `setFilter`, `setLayoutProperty` (including `visibility`) and changing a
  **data-driven** paint expression make the worker re-process the whole source. Never do them per
  frame. Doing it for the 7-day layer every frame jammed the worker queue for seconds, so later
  `setData` calls (new country, new points) waited: the old country's squares were painted with the
  new values (a "vertical strip") and the 7-day points sometimes never appeared.
- Layers at opacity 0 are still processed in every tile load; hide with `visibility` (once).
- Animate with feature-state (grid values) or constant paint properties (opacities) only.
- 7-day source: `buffer: 16`, `maxzoom: 10`, no `circle-sort-key`. The intro does not show the
  7-day points (tiling ~78k points at every zoom of the flight is what stalled the worker).
- React: anything that scans the 7-day points or all cells must be memoised; hover re-renders the
  panel. Calendar cells are `memo`. Measured hover cost went from 130-440 ms to ~10-30 ms of JS.
- `GeoJSONSource.setData` returns a promise in MapLibre 6; use it to know when data is tiled.

## 9. Known limits and open work

- Limits to keep stating: hotspots are not fires or burned area; harmonization is statistical and
  scored against MODIS; 0.1° history resolution (areas smaller than a cell have no history); no
  correction for clouds or overpass counts; NRT data is provisional.
- Open:
  - Test the Vaul drawer on a real phone.
  - Deploy on Vercel.
  - Data size in git grows with each 7-day refresh; consider serving data from the Go API or
    object storage (backend change, ask first). Automate the 7-day refresh.
  - Code-split MapLibre / terra-draw.
  - Optional: 7-day playback by day; per-biome harmonization coefficients; more continents.
