# Tonalli ATLAS (fire calendar website): context for agents

Read this before changing anything in `4-web_atlas/`. It explains what the app is for, where every number
comes from, how the code is organised, and the traps already found. Keep it current when you change
behaviour.

## 1. Project and goal

- Name: **Tonalli ATLAS**. Tonalli is a Nahuat word of the Pipil people for the sun and its fire and
  the count of days and nights (the calendar); ATLAS = Analytics, Tracking & Logging Archive for
  Satellites, and an atlas of maps of the whole world. The landing page (`../5-web_landing`) is the
  site root; this app lives at `/atlas/`.
- NASA Space Apps 2026, challenge "MODIS and VIIRS Hot Spots" (team Los Llama Masters). Challenge
  text: `../CHALLENGE.md`; plans: `../0-plans/` (the harmonization plan is
  `../0-plans/HARMONIZATION_PLAN.md`).
- Goal: a **harmonized burning-activity calendar**. MODIS (2000 onward) and VIIRS (2012 onward)
  hotspots become one monthly record, so the sensor of origin no longer matters. A user picks a
  country (or draws an area), sees when it burns, which years burned more, how now compares, and
  downloads CSVs. Audience: emergency managers, land managers, firefighters, scientists.
- Scope: every country with FIRMS data (235). Brazil opens by default.
- The repo is a pipeline; this app is its last step:
  `1-extract_data` (FIRMS → R2, Railway) → `2-process_data` (clean, aggregate, export to
  `exports/` in R2, Railway) → `3-api_atlas` (Hono on a Cloudflare Worker) → `4-web_atlas` (this app, served
  by the same Worker). The site has **no data of its own**; everything comes from the API.

### User rules (from the team)

- UI text is **English only**. Conversation with the user is usually in Spanish.
- Before installing a new library: explain what it is for and whether it is free; ask.
- Use real FIRMS data; label any sample or synthetic data as such.
- Prioritise what can be finished in a 48 h hackathon.
- Design: functional, not overloaded, polished but restrained animation, **no "AI slop"** (see §7).
- Never commit secrets. The site needs none; `.env.local` only holds `VITE_API_URL`.

## 2. Run, build, verify

Bun is the package manager; the toolchain is [Vite+](https://viteplus.dev) (`vp`: Vite, Oxlint,
Oxfmt; MIT).

```sh
cd 4-web_atlas
bun install
bun run dev          # vp dev, http://localhost:5173
bun run check        # vp check: format, lint (type-aware) and type check
bun run fix          # vp check --fix
bun run build        # tsc + vp build -> dist/  (~490 KB gzip JS, mostly MapLibre)
```

With mise from the repo root: `mise run web:dev`, `mise run web:check`, `mise run web:build`.

The dev server calls `/v1/...` on its own origin; put `VITE_API_URL=https://llama-masters-api.esauflores.com`
in `.env.local` (see `.env.example`) to use the deployed API (it sends CORS `*`).

There is no unit-test suite. Verify with `bun run check`, `bun run build`, and a browser. Headless
Chromium works for screenshots (`--use-angle=swiftshader --enable-unsafe-swiftshader`); the opening
animation takes several seconds, so wait before judging an empty map. In DEV the MapLibre map is
exposed as `window.__map` for debugging.

Deploy: from `3-api_atlas`, `bun run deploy` builds this app and deploys the Worker. Cloudflare serves
`dist/` as static assets at <https://llama-masters.esauflores.com> (any unknown path gets
`index.html`); only `/v1/*` and `/healthz` run the Worker.

## 3. Data: the API

Files written by `2-process_data/src/export.py`, served by `3-api_atlas` (shapes in `src/lib/types.ts`):

| Route                     | File                   | Content                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/v1/places`              | `places.json`          | id, label, ISO codes, bbox, states, first month, last day, `version`                                                                                                                                                                                                                                                                                |
| `/v1/places/<id>/grid`    | `monthly_grid.json`    | version 6 (5 still read): flat columns (`count`, month `gap`, integer `value` × `scale`), decoded by `data.ts` into `[west, south, modis, viirsEq, modisBt, viirsBt]` cells with sparse `[month, value, ...]` pairs (`modisBt` pairs line up with `modis`; temperatures in K, 0 = none); `cell_deg` 0.1° or coarser for big countries (size budget) |
| `/v1/places/<id>/monthly` | `monthly.json`         | country + states: MODIS, S-NPP, NOAA-20, NOAA-21, `viirs_eq` (the record), `modis_eq` (converted MODIS every month), p10/p90, baseline, held-out scores                                                                                                                                                                                             |
| `/v1/places/<id>/meta`    | `meta.json`            | satellite spans, harmonization factors and score, method, sources, limitations                                                                                                                                                                                                                                                                      |
| `/v1/places/<id>/recent`  | `recent_hotspots.json` | last 7 days of points, columnar                                                                                                                                                                                                                                                                                                                     |

- Every month axis carries `source` (observed | reconstructed), `satellite` (NOAA-20 | NOAA-21 |
  S-NPP | MODIS), `partial` and `provisional`.
- The record starts in 2000-11; `data.ts` pads files so month index 0 is a January.
- **Caching:** `version` is a hash of the place's four files. `loadPlace` adds `?v=<version>`; the
  Worker caches versioned files for a year and `/v1/places` for 60 s, so a new export shows within
  a minute. Never drop the `?v=`.

## 4. Harmonization (the scientific core; done in export.py, not here)

- VIIRS (375 m) reports several times more hotspots than MODIS (1 km) for the same fires, so raw
  counts are never mixed. The record is on the **VIIRS NOAA-20 scale** (VIIRS keeps flying).
- From 2012: real VIIRS every month, NOAA-20, else NOAA-21 × f21, else S-NPP × fNPP. Satellites are
  never added together.
- Before VIIRS: MODIS (Terra + Aqua) converted per 0.5° cell and calendar month,
  `R_c × F_m × fNPP × MODIS`, cell ratios shrunk toward the country ratio; Terra-only months
  (before Aqua, mid-2002) get a Terra factor first. Fitted on years where S-NPP and MODIS overlap.
- Scored by leaving one year out (WAPE, bias, year ranking, p10-p90 coverage) against real VIIRS. A
  country or state falls back to its own ratio × F_m when per-cell ratios do not beat it
  (`model: "ratio_fm"`). The panel ("How MODIS and VIIRS are combined") shows these scores.
- The seam test of the plan (converted MODIS vs real VIIRS 2012 onward, no break at 2012) is the
  "MODIS vs VIIRS" chart.

## 5. Semantics the UI must keep

- `null` = no source data (hatched), `0` = observed, no hotspots. Never fill nulls with zeros.
- Partial months (a satellite starts or ends mid-month, the month in progress) are dashed and
  excluded from averages and ranks.
- Provisional = near-real-time data; flagged in text and CSV.
- Views: Harmonized (default, the record), MODIS only (Terra + Aqua, raw), VIIRS only (the record
  where VIIRS observed it).
- Averages use complete years from 2003 (both MODIS satellites; for the VIIRS view, every complete
  year), minimum 3 years (`MIN_BASELINE_YEARS`). Earlier complete years are shown faded and not
  ranked.
- Current calendar month to date: share of the full-month arithmetic MEAN, not a same-day pace
  (no daily history); missing data, late start, short baseline and zero mean are explained.
- Fire season = the 3 consecutive months with the largest share of the average year.
- "Last 7 days vs a typical week" counts points on the record's scale: NOAA-20 (Terra + Aqua for
  the MODIS view); typical week = `climatology[month] / daysInMonth * 7`.
- "Hotspot" = a satellite pixel with an active fire; not a fire count or burned area. Say
  "hotspots" in the UI, not "detections" or "fires".

## 6. Code map (`src/`)

- `main.tsx`: imports MapLibre CSS **before** `styles.css` (otherwise MapLibre's popup CSS wins and
  popups turn white), fonts, `MotionConfig reducedMotion="user"`.
- `App.tsx`: layout. Desktop (>= 1024 px): full-width map with the `Summary` card under the place
  switcher; "Details & stats" slides in the 440 px panel (✕ or Esc closes it, Esc cancels drawing
  first) and hides the card. Mobile: full map + Vaul drawer
  (snaps `168px`, `0.55`, `1`). Owns `layer` (history | recent), `drawMode`, drawer `snap`, the
  `play` action (switch to history, start playback, fold the drawer on mobile). Desktop bottom bar =
  legend + timeline (wraps on narrow maps); on mobile they float above the drawer's measured top.
  The drawer scroll viewport follows its visible height at every snap; only the accessible Vaul
  handle drags/snaps it. The legend and zoom controls remain above the folded and half-height drawer;
  at full height the panel supplies the calendar legend and map controls are hidden.
  Opening the panel shrinks the map (MapView's ResizeObserver calls engine.resize).
- `state.ts` → `useExplorer()`: the single app state. Places, current place, `loaded`, `status`
  (with byte progress), `shape` (selection), `kind` (`HARMONIZED` | `MODIS` | `VIIRS`),
  `range`, `focus` year, `hoverMonth`, playback (`playing`, `speed`, `timelineOpen`,
  `play/pause/seek/stopPlayback`), 7-day sensor toggles. Derived: per-cell `values` for all kinds
  (computed once per place), `cells` in the selection, `series`, `stats`, `recentInArea`, `recent` (after toggles), `selectionLabel`.
  Playback has a separate clamped cursor; `hoverMonth` exposes the played month while running.
  Pause, close, date-range changes and switching map layers clear hover and restore range totals
  and the range color scale. Seeking previews the chosen month on the map and moves the resume
  cursor; explicit pause/close still restore range totals. Switching to Last 7 days pauses playback
  and disables calendar/chart map hovers. The panel's map-month row follows playback, seeking and
  in-range hover with the map's null/zero semantics; the annual comparison remains distinct.
- `lib/`
  - `types.ts`: all data shapes.
  - `data.ts`: `loadPlaces` (`/v1/places`), `loadPlace` (grid, monthly, meta and recent with `?v=`;
    streams with byte progress), `padAxis`/`alignGrid`/`alignMonthly` (pad to January),
    `DEFAULT_PLACE`.
  - `series.ts`: `cellsIn`, `cellValues`, `coverage`, `gridSeries`, `computeStats`, `rankOf`,
    `seamSeries` (converted MODIS vs real VIIRS for the sensor chart).
  - `currentMonth.ts`: month-to-date comparison and source-cutoff explanations; consumes the shared
    series contract without changing its exports or data formats.
  - `seasonal.ts`: focus-excluding seasonal percentiles, latest complete month versus earlier
    complete baseline years, complete annual totals and compact chart ticks.
  - `color.ts`: `HEAT` (magma), `ANOM` (blue-red), `SENSOR` colours, `sensorOf`.
  - `validate.ts`: coordinate parsing (`-9.5`, `9,5 S`, `55.5°W`, U+2212), ranges, bbox overlap.
  - `geo.ts`, `format.ts`, `csv.ts`: UTF-8 with BOM (Excel), counts rounded to whole hotspots. Monthly CSV
    (`<place>-<all|drawn-area>-<view>-monthly.csv`): `area`, `year`, `month`, `view`, `hotspots` (the shown view),
    `status`, `month_average`, `vs_average_percent`, `provisional`, then `harmonized_noaa20_scale`, `modis_hotspots`,
    `viirs_observed_noaa20_scale`, `record_source`, `record_satellite`. Hotspot CSV: `date_utc`, `time_utc`, lat/lon,
    `instrument`, `satellite`, `modis_confidence_percent` / `viirs_confidence` (low/nominal/high), `fire_power_mw`,
    `brightness_k`, `state`.
- `map/`
  - `engine.ts` (`MapEngine`): MapLibre globe, OpenFreeMap dark style with offline fallback,
    thinned basemap labels with subdued state/city text and halos set once, `minZoom` 1.7. Sources/layers: `grid` (fill; colour from
    **feature-state** `v`), `recent-heat` + `recent-dots` (circles; colour by sensor, size by FRP,
    MODIS ordered last to draw on top), `mask`, `areas`, `outline`. TerraDraw rectangle/polygon
    (polygon refuses self-intersection). `setGridCells` (geometry once per place/selection; grid
    hidden until tiled), `setGridValues` (feature-state per cell; paint only when the scale
    changes), `setRecent`, `setLayer`, `setSelection`, `fit`, `intro` (fly + fade in history),
    `skipIntro`. Every public method checks `destroyed`.
    `setBasemap` switches constructor-created `gibs-satellite` / `gibs-night` rasters beneath data
    and boundaries; restores original Dark visibility/label paint. `setLabels`, `setBorders`,
    `setGridOpacity`, `setProjection` apply display options; opacity keeps intro/pending/recent guards.
  - `MapView.tsx`: wires state to the engine. Shown cells = selection only; values = total over
    the range, or one month (hover/playback) with **one fixed monthly scale** (98th percentile of
    cell-months in range). Load card, captions.
  - `MapStatus.tsx`: `LoadingCard` (basemap / history / 7 days with real MB), `MapCaption`.
- `components/`
  - `Toolbar.tsx`: `PlaceSwitcher` (search by name or ISO code; Enter picks the first match),
    `DrawTools` (one "Select area" menu, icon-only on phones: Rectangle, Shape, Coordinates; mutually exclusive; coordinate form with Point and
    Box tabs and per-field validation; on phones popovers become a sheet and the drawer folds),
    `SelectionChip` (area label + Clear), `LayerSwitch`.
  - `MapOptions.tsx`: cog toolbar popover / phone sheet, basemap, names, borders, temperature toggle and units, opacity, projection,
    Reset; imagery disabled offline, dated composites explicitly not live. `hooks/useMapOptions.ts`
    validates and persists App-owned defaults to `map:options`; MapView applies each option separately
    (opacity coalesced to animation frames, immediate slider paint; other grid fades remain 700 ms).
  - `Panel.tsx`: order = header → `KeyNumbers` (last 7 days → current month to date, short note with a
    "How is this calculated?" disclosure → focus year → fire season) → "What is burning now?" (`Recent`)
    → "When does it burn?" (`DateRange`, selected-dates total with a per-year figure, `Calendar`; help
    text differs for mouse and touch) → "Which years burned more?" (`Anomalies`) → "How does {focus}
    compare?" (lazy `Charts`) → Download (`Export`) → "How MODIS and VIIRS are combined"
    (`Sensors.HowCombined` plus the lazy MODIS vs VIIRS seam chart; the record switch lives only in the
    map legend) → About this data.
  - `Summary.tsx`: desktop map card: selection, three numbers (dates total, fire season, focus year
    vs mean), `YearCalendar` (one year as 12 month tiles, ‹ › change the focus year, hover shows the
    month on the map) and the "Details & stats" button. The year label opens a 5-column grid of every
    year with data, tinted by the anomaly scale vs the mean year (faded before the baseline, dashed when
    incomplete, legend underneath); arrows / Home / End navigate, Escape closes.
    One `focus` year for the card and the panel: it defaults to the current UTC year while it has any
    data (else the latest year with data); an incomplete focus year shows "N hotspots so far", no rank. `computeStats` includes partial final
    years in its year list, but missing months exclude them from complete-year totals and baselines.
  - `Timeline.tsx`: the player bar (only while playing) and `PlayButton` (toolbar, history layer).
  - `PlaceSwitcher` groups countries by continent (`lib/continents.ts`, by place id; "North & Central
    America" and "Caribbean" are separate groups; unknown ids go
    to "Other"); continent chips filter, search looks in every continent. "Global" sits on top.
  - Global (`lib/global.ts`, `components/GlobalPrompt.tsx`): there is no world file. Clicking the map
    toggles the country under the click (bbox candidates, then the country's `outline`, a few KB,
    cached by `data.loadOutline`); drawing or typing an area picks every country whose border it
    touches and clips to the area (a click after an area starts a new country selection). Only the
    picked countries are downloaded (`loadPlace`, cached for the session in `state.ts`) and
    `mergeLoaded` joins them: grids side by side with per-cell sizes (`cell_degs`; border cells
    exported by two countries are added, temperatures hotspot-weighted), 7-day points together, all
    borders drawn. From 3 countries, or a heavy pick (`isHeavy`: weight guessed from the borders'
    area, never shown), a card warns once per Global visit that the map may freeze ("Load anyway" /
    Cancel), with no sizes or lists. Global is handled entirely in the site; the pipeline and API
    are not changed for it. The method section lists each country's ratio and held-out error;
    the MODIS vs VIIRS chart stays per country. The map keeps its view while countries are added,
    and a click within 500 ms of finishing a drawing is not a country pick.
  - Basemap: Satellite (default) or Night lights; Dark is only the offline fallback. Saved "dark"
    options migrate to Satellite (`hooks/useMapOptions.ts`). Scrollbars are themed in `styles.css`.
  - `Calendar.tsx`: SVG years x months; memoised `Cell`s; hover shows the month on the map, drag
    sets the range, click a year to focus it; tooltip anchors to its side at the edges. Pointer
    selection handles capture, cancellation and clamped endpoints. Touch keeps vertical scrolling
    by default; "Drag to select dates" enables dragging between rows. Arrow keys navigate,
    Shift+arrows select, Enter focuses a year and Escape cancels. Partial-cell accessible names
    include "partial month".
  - `Timeline.tsx`: radar-style playback (4 months/s at 1×; 0.5×/1×/2×/4×, so 0.5× is 500 ms/month),
    scrubber, loops with a short hold at the end. Responsive player rows keep all four speeds visible.
  - `DateRange.tsx` (custom month picker + presets), `KeyNumbers.tsx`, `Anomalies.tsx`,
    `Recent.tsx`, `Export.tsx`, `Sensors.tsx`, `ErrorBoundary.tsx`.
  - `Legend.tsx`: sensor record switch and map colour scales, with year-first abbreviated month labels.
    `compact` (phones): title + ramp only; the switch opens from a small "Harmonized ▾" button.
    Last 7 days has Both / MODIS / VIIRS buttons that filter the recent map points and sensor temperature bars;
    dates in the same month share the year and month (e.g. `2026 Nov 9–15`). Temperature controls live in Map options (°C, °F, K;
    `map:metric`, `map:unit` in localStorage). Temperature = FIRMS brightness temperature (pixel, not
    flame). `lib/temperature.ts`: single-sensor views keep their own scales (2nd–98th percentile,
    fixed per place). Harmonized history uses quantile mapping of MODIS onto the VIIRS scale,
    cached per grid; ranges are detection-weighted means and cell opacity reflects hotspot counts.
    VIIRS I4 saturates near 367 K, MODIS reaches ~500 K. 7-day dots still use `recentScales` per sensor.
- `hooks/useDismiss.ts`: outside-click / Escape to close popovers.
- `components/charts/`: shared accessible tabs "Seasonal pattern" and "This month"; `Sensors.tsx` is the
  seam chart (`modis_eq` against real VIIRS, whole country only), shown in "How MODIS and VIIRS are combined".
  `Anomalies` and `Calendar` draw in a 400-unit viewBox and scale their font with `useWidth` so labels stay
  ≥ 10–11 px on phones.
- `hooks/useWidth.ts`: ResizeObserver width for responsive chart axes.
- `hooks/useDrawerViewport.ts`: measures the visible drawer during snap/drag/resize transitions,
  sizing the scroll area and positioning mobile map overlays without changing map layers.
- `styles.css`: Tailwind v4 `@theme` tokens and component classes (`.seg`, `.field`, `.btn`,
  `.link`), MapLibre chrome and popup restyle, timeline scrubber, `details[open]` fade-in.
- `components/Brand.tsx`: `TonalliMark` (the landing's sun), `BrandName` and `BrandLink` (top-left of the
  toolbar, links to the landing, `VITE_LANDING_URL` or https://tonalli.earth/; name hidden on phones, sun only). The panel header uses the same mark.
- `tour/`: own product tour (no library), text only. Opens with what Tonalli ATLAS is and why the name.
  - `steps.ts`: all copy and targets. `title` / `body` (`bodyMobile` replaces `body` on phones);
    `target` is a `data-tour` value (none = centred card), `side` the preferred card side, `only`
    limits a step to desktop or mobile, `view: "details"` opens the desktop panel and `view: "map"`
    closes it and shows the calendar card. `tourStepsFor(desktop)` filters.
  - `demo.ts`: `setTourDemo(id)` / `useTourDemo(id, setOpen)`. A step's `demo` opens that popover while
    it is shown (`place`, `area`, `map-options`, `year` on desktop; `record`, the compact legend switch,
    on phones too) and closes it when the step ends. Its `target` lists the trigger and the popover
    (`place place-menu`, `area area-menu`, `map-options map-options-menu`, `calendar-card year-picker`);
    the spotlight covers their union. Copy stays one short line per step.
  - `seen.ts`: `tourSeen` / `markTourSeen` (`tour:seen` in localStorage plus an in-memory flag).
  - `Tour.tsx`: portal overlay (`z-[100]`) with a box-shadow spotlight that follows the target every
    frame (clipped to its scroll container and the viewport; containers scroll via `scrollTop`, never
    `scrollIntoView`), a card that flips sides and stays 12 px inside the viewport, and `TourButton`
    (toolbar `?`, next to Map options). Missing targets are skipped after 1.5 s. Esc is caught in the
    capture phase so App's Esc handler does not close the panel.
  - `App.tsx` opens it once after the intro (`introDone` and ready, 800 ms), saves and restores
    `detailsOpen`, `calendarOpen`, drawer `snap` and `layer`, forces History (when available) and
    pauses playback; on mobile the drawer stays at `0.55`. `<Tour key={desktop ? "d" : "m"}>` restarts
    it across the breakpoint.
  - `data-tour` targets (15 steps on desktop, 14 on mobile): `brand` (BrandLink), `place` (PlaceSwitcher), `area`
    (DrawTools), `record` (Legend card), `play`, `layers`, `map-options`, `calendar-card` and
    `details` (Summary, desktop), `drawer` (mobile handle row), `calendar`, `anomalies`, `download`
    (`Panel` `Section`'s `tour` prop) and `tour-button`. Global before any pick has no calendar, so
    those steps are skipped. One short sentence per step naming the gesture.
  - Known limit: on mobile, Vaul leaves Radix Dialog modal, so focus stays trapped in the drawer and
    the tour card cannot take keyboard focus there (touch works).

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

- Limits to keep stating (also in `meta.limitations`): hotspots are not fires or burned area;
  converted months before VIIRS are estimates with a p10-p90 band; areas drawn smaller than a
  0.5° fit cell inherit its ratio; no correction for clouds or overpass counts; NRT is provisional.
- Open:
  - Test the Vaul drawer on a real phone.
  - Code-split MapLibre (main chunk ~470 KB gzip). terra-draw is already a dynamic import on the first
    drawing, and Charts / the seam chart are lazy. Grid values per cell are `Float32Array`.
  - State-level views (monthly.json already has every state's series).
  - Automate the daily refresh (extract → process → export on Railway).
