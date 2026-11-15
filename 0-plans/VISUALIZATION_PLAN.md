# Globe and visualization plan

## Goal and scope

Build a memorable global overview that leads into useful regional analysis:
**globe overview → selected region → map and weekly burning calendar**.
This fits the two-day hackathon only if an existing map library handles the globe.
Full custom 3D rendering is outside scope. The historical calendar and real data
integration take priority over globe styling and animation.

## Visual options

| Option | Purpose | Decision |
|---|---|---|
| Globe with recent hotspot aggregates | Introduce global activity and select a region | Prototype within two hours; retain only if stable |
| Regional 2D map | Inspect locations and filter activity | Required fallback if globe integration fails |
| Weekly calendar heatmap | Reveal recurring seasonal activity | Core view, dependent on usable historical data |
| Observed versus historical-average chart | Compare activity with seasonal expectations | Include when baseline data is available |
| Small maps side by side | Compare sensors or periods | Optional after integration; fixed extent and scales |
| Time playback | Show changes in recorded activity | Optional after manual date selection works |

## Implementation choice

Start with MapLibre GL JS and its globe projection so global and regional views
share one mapping workflow. Person 2 owns the technical spike and records the
chosen package version and map style source. Check basemap attribution, access
requirements, and availability before depending on a style.

Globe.gl is an alternative if the globe becomes the main presentation; it
provides point, heatmap, and hexagonal-bin layers. Avoid implementing both
libraries during the event. Do not add a globe library merely to duplicate an
already working map.

Useful official references:

- MapLibre: https://maplibre.org/maplibre-gl-js/
- Globe projection: https://maplibre.org/maplibre-style-spec/types/
- Globe.gl layers and examples: https://globe.gl/

## Two-hour globe decision

Within Person 2's first two hours of implementation, demonstrate:

1. A globe that loads and can be rotated on the demo laptop.
2. A small real-data overlay with readable platform and date labels.
3. Selection of one supported region and camera movement to it.
4. Correct filtering without drawing all global raw CSV rows in the browser.

If any part blocks the main map work, use a regional 2D map for the demo. The
globe is optional and must not delay the hour-3 data gate or Day-1 deployment.

## Main user journey

1. Open the overview and see the actual recent-data date range.
2. Choose from up to three predefined areas within the chosen region. Globe selections
   outside prepared areas explain that detailed history is unavailable.
3. Move to the selected region and display its map and calendar.
4. Select a platform and week; expose exact counts, dates, and source status.
5. Compare the selected platform's activity with its historical weekly average,
   when available. Forecasts remain a separately labeled optional experiment.

Use the same prepared areas as the hackathon plan; do not acquire extra regions
solely for the globe. A global recent overview does not imply global historical
coverage. Recent global aggregates and regional historical exports are separate
data products and must keep their date labels visible.

## Data and visual encodings

Person 4 prepares a lightweight global recent aggregate only if it fits the
existing data workload. Otherwise show supported regional extracts on the globe.
Aggregation retains platform and date so filters remain honest. Exports belong
under `data/processed/`, with their schema agreed before frontend integration.

- Default to one platform; changing the platform must update the legend.
- Color or symbol area represents reported detections, not fire size or severity.
- Use quiet boundaries and legible points. Optional glow is decorative and does
  not represent burned area, spread, or positional uncertainty.
- Preserve scales during time playback; disclose transformed or normalized values.
- Display missing data and incomplete weeks distinctly from zero reported detections.
- Do not connect detections with arcs: the records do not establish movement
  between fires. The airplane-screen inspiration applies to camera movement and
  geographic navigation, not inferred trajectories.
- Keep controls for rotation/playback explicit; avoid continuous camera motion
  while the user is reading or comparing values.

The calendar uses years as rows and ISO weeks as columns, with source-aware
missing states. Detailed inspiration and attribution are in
[the visualization references](references/dominic-roye/README.md).

## Ownership and schedule

| Owner | Deliverable | Timing |
|---|---|---|
| Person 1 — UX | Main-screen layout, shared legends, globe-to-region interaction, missing-data labels | First working hour, then support integration |
| Person 2 — Map frontend | Two-hour globe spike, map controls, region selection, 2D fallback | Day 1; assist deployment after map works |
| Person 3 — Calendar/integration | Calendar and comparison chart, shared selection state, technical deployment | First real-data build by end of Day 1 |
| Person 4 — Geospatial data | Regional extracts and weekly series first; lightweight overview only if time permits | Follow hour-3 historical-data gate |
| Person 5 — Baseline/modeling | Historical averages, sample sizes, optional evaluated forecast | Baseline before model experiments |
| Person 6 — PM | Enforce time budget, scope cuts, visual consistency review, demo rehearsal | Both days |

Day 2 is for validation and refinement of the existing views. Freeze features
at cumulative working hour 12. Cut animation, glow, additional map panels, and
the globe itself before sacrificing working data integration or the calendar.

## Acceptance checks

- Global and regional views state the actual dates and supported geographic scope.
- Area/platform/date state stays consistent across views; unavailable historical
  map data is explained rather than replaced silently with recent hotspots.
- User can read counts and dates without relying on color alone.
- Globe performance is usable on the presentation laptop with prepared real data.
- The regional map and calendar remain usable without animation.
- A local build and saved data support the demo; if remote basemap tiles fail,
  prepared boundary geometry or an explicitly labeled static backup preserves
  geographic context.
- The pitch does not present styling, aggregation, or a globe as proof of sensor
  calibration or forecast accuracy.

## Related plans

- [Hackathon responsibilities and milestones](HACKATHON_PLAN.md)
- [Forecasting approach and evaluation](FORECASTING_PLAN.md)
