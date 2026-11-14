# Two-day hackathon plan

Six people, 48 elapsed hours. The schedule assumes two working days with an
overnight break, not 48 hours of continuous work. Assign names to the roles at kickoff.
Hours below are cumulative team working hours (0–8 on Day 1, 8–16 on Day 2).
The plan assumes two teammates can implement a frontend and two can work in Python.

Independent review found the prototype feasible after narrowing the data and
forecasting branches. Full cross-sensor calibration and operational prediction
are not two-day deliverables.

## Demo goal

A user selects one supported area, sees recent satellite hotspot activity,
explores a historical weekly burning calendar when archive data is available,
and compares current activity with typical seasonal activity. Add a one-week
forecast only if historical data and an honest evaluation are ready.

Start with one region and a small set of predefined areas within it. Defer global
historical processing, arbitrary polygon uploads, accounts, and live alert delivery.
The existing seven-day global snapshot supports the recent activity map; it does
not support an annual calendar or a validated seasonal forecast by itself.

Primary user: a land manager examining when reported burning activity usually
peaks in a selected area. The default metric is **weekly reported hotspot
detections per predefined area, separately by sensor/platform**. This is not
unique fires, burned area, or coverage-corrected burning. Select one primary
historical platform for the calendar and any forecasting experiment at kickoff.

## Team: three UI/UX, two data and prediction, one PM

| Person | Ownership | Concrete deliverables |
|---|---|---|
| 1 — UX and visual design | User journey, layout, map/chart legends, accessibility | One main-screen design, clear labels for observed/typical/predicted activity, brief usability checks |
| 2 — Frontend map | Area selection, hotspot map, sensor and date filters | Working map connected to prepared geospatial data |
| 3 — Frontend calendar and integration | Weekly calendar, charts, data loading, technical deployment | Working calendar/chart, integrated app, loading/empty/error states, deployable static build on Day 1 |
| 4 — Geospatial data and harmonization | Historical retrieval, GeoPandas processing, quality rules, spatial aggregation | Reproducible preparation script, coverage metadata, documented sensor treatment |
| 5 — Baselines and prediction | Seasonal baseline, anomaly comparison, forecasting experiment, evaluation | Weekly series, baseline, optional evaluated one-week point forecast; intervals only if already supported |
| 6 — PM and demo | Scope, milestones, dependency resolution, deployment coordination, pitch | Prioritized board, acceptance checklist, reproducible demo and backup |

The split works because two of the UI/UX people also implement the frontend.
Data preparation and harmonization have a named owner rather than becoming
unassigned work between design and modeling. Everyone helps integrate and test
their own deliverable; the PM coordinates rather than becoming the sole tester.

## Day 1: establish the data and connect the app

| Working hours | UI/UX team | Data/prediction team | PM |
|---|---|---|---|
| 0–1 | Agree on the main user journey and draft one screen | Inspect data; select candidate region and historical source | Confirm region, roles, minimum demo, and shared data contract |
| 1–3 | Design and build map/calendar skeleton against clearly labeled fixtures | Retrieve a small historical sample; prove spatial filtering and weekly aggregation | Check archive access and resolve dependencies; enforce the hour-3 data decision |
| 3–6 | Implement filters, legends, charts, and interface states | Prepare real regional data; retain sensor identity; build seasonal baseline if history permits | Track blockers, coordinate first integration |
| 6–8 | Connect real exports; walk through the full user journey | Deliver weekly series and metadata; verify counts and dates | Run an end-to-end demo; freeze core scope for Day 2 |

**Hour-3 decision:** Person 4 delivers a parsed regional extract and Person 5
successfully loads its weekly series. Require at least three complete years from
one primary platform for the seasonal-calendar branch; this is a scope threshold,
not proof of scientific sufficiency. With less history, show a descriptive calendar
for the available dates without claiming established seasonality. Record actual
source completeness and gaps. Forecasting has its own eligibility check below.
Access to a download page alone does not pass the gate.

If the gate fails, stop modeling and prioritize recovering a real historical
calendar over polish. If only the existing seven-day snapshot is available,
ship recent activity exploration labeled **partial challenge demo**. State that
historical harmonization and the annual calendar are unfinished. Do not build a
synthetic annual calendar. The modest historical target is one platform's
calendar plus MODIS/VIIRS comparisons for matching available dates, with
cross-sensor calibration explicitly unfinished.

**End-of-Day-1 milestone:** the app loads real hotspot data, supports a selected
area, and renders a chart or calendar for the actual available dates. No core
screen depends on an unfinished model service.
Person 3 produces the first deployable build by this milestone; Person 2 assists
with deployment once the map works. PM verifies the submission link and backup.

## Day 2: validate, refine, and prepare the demo

| Working hours | UI/UX team | Data/prediction team | PM |
|---|---|---|---|
| 8–10 | Refine hierarchy, responsive behavior, and comparison views | Complete historical baseline and sensor comparison; benchmark a simple forecast if feasible | Confirm which claims the evidence supports |
| 10–12 | Integrate final outputs and explain uncertainty/coverage | Compare XGBoost with a seasonal baseline; try TimeGPT only if access is already available and time permits | Freeze features at hour 12; cut incomplete experiments |
| 12–14 | Fix end-to-end bugs and confusing states | Verify exports, forecast dates, missing data, and evaluation results | Coordinate deployment and prepare a local/static backup |
| 14–16 | Final visual and usability checks | Document methods and limitations; support integration | Rehearse a three-minute pitch and repeat the exact demo path |

Cut features in this order when behind: TimeGPT, intervals, extra filters, then
forecasting. Preserve the real data path and historical calendar ahead of these.

Leave remaining elapsed time for breaks, event activities, and submission. Adjust
working blocks to the event's actual start, deadline, and presentation slots.

## Data and harmonization scope

Use GeoPandas for geographic filtering, spatial joins, and aggregation. Keep
computational geometry processing in Python and send small prepared outputs to
the browser. GeoPandas is a processing tool, not the web map renderer.

For the hackathon:

1. Preserve platform, acquisition time, confidence, and processing version.
2. Apply documented sensor-specific quality rules and common weekly boundaries.
3. Use the same areas and periods when comparing MODIS and VIIRS.
4. Keep sensor series separate unless an adjustment is supported by overlap data.
5. Separate source completeness from satellite observation coverage. When an
   archive period is confirmed complete, no matching rows means zero *reported
   detections*, not proof of no burning. Unavailable source periods are `null`.
   Cloud/pass coverage remains `unknown` unless measured; disclose that no
   observation-coverage correction was performed.

Shared grids and weekly bins are a first step toward harmonization. They do not
remove differences in sensitivity or observation opportunities. Do not claim a
fully harmonized multi-decade record from this prototype. If calibration cannot
be validated in time, demonstrate comparable aggregation and transparent sensor
comparisons, and identify calibration as unfinished work.

## Prediction scope

Follow [FORECASTING_PLAN.md](FORECASTING_PLAN.md), with tighter hackathon priorities:

1. Seasonal baseline first, using earlier years only for each evaluation date.
2. XGBoost with lagged activity and seasonal features if sufficient history exists.
3. TimeGPT as an optional comparison, not a dependency for the demo.

Evaluate on later periods held out from training. Use MAE and comparison with
the baseline; inspect missed peaks. Fit learned preprocessing only on the training
period. Do not use realized future weather as a forecasting input. Defer weather
integration unless suitable data is already available.

For the optional point-forecast experiment, compare both models over the same
last 12 complete weekly forecast origins, training on earlier data at each origin.
Report MAE and inspect peaks; this is an initial benchmark, not operational validation.
Skip the experiment if the series has unresolved gaps or insufficient history.
Publish a forecast only if its origin, horizon, and evaluation results are
documented. Label uncertainty unavailable if no interval method is ready; defer
intervals rather than inventing them. Otherwise show historical expectations and current
observations without implying a validated predictive model. Unusual activity
relative to seasonal history is not automatically a calibrated emergency alert.

## Integration contract

Person 4 owns `areas.geojson`, `hotspots.geojson`, `weekly_activity.json`, and
`metadata.json`; Person 5 owns `baseline.json` and optional `forecast.json`.
Person 3 consumes them and owns technical deployment. Use these names under
`data/processed/`, then package the needed exports with the frontend. These are
planned outputs, not files already generated. Prepared files suffice; no live
backend is required. Agree on one sample of each output in the first hour.

| Output | Minimum content |
|---|---|
| Areas | Stable area ID, name, and geometry |
| Recent hotspots | Coordinates, acquisition time in UTC, sensor/platform, confidence, FRP |
| Weekly activity | Area ID, week start, sensor or measure name, activity value, coverage status |
| Seasonal baseline | Area ID, calendar week, expected activity, method, historical period used |
| Optional forecast | Area ID, forecast origin, target week, point estimate, optional interval bounds and level, model |
| Metadata | Sources, retrieval time, coverage dates, units, quality rules, harmonization status, limitations |

Use `null` for unavailable source periods. A complete source with no matching
rows can have zero reported detections while observation coverage is unknown.
Weeks start Monday 00:00 UTC. Include an ISO week-year key (including week 53)
and exact start/end dates. Mark partial edge weeks incomplete; exclude them from
full-week seasonal comparisons and model training. Do not compare the partial
current week against complete historical weeks.

The currently saved November 7–14, 2026 snapshots contain no complete Monday–Sunday
week. Use labeled recent daily activity or partial-week counts for those files;
disable full-week comparisons and training until complete matching data exists.

Forecast the first week after the last complete training week. Show the training
cutoff and origin. A forecast originating from old archives is a retrospective
experiment, not a current outlook.
Model uncertainty bounds should be absent when unavailable; do not fabricate them.

Example weekly row (illustrative schema, not an observed value):

```json
{"area_id":"area_01","week_start":"2025-07-07","week_end":"2025-07-14","iso_week":"2025-W28","platform":"NOAA-20","reported_detections":42,"source_complete":true,"week_complete":true,"observation_coverage":"unknown"}
```

Person 4 supplies a tiny valid GeoJSON sample; Person 5 supplies a baseline row
and, if used, a forecast row matching these area/platform/date keys by hour 1.
All baseline rows include reference years and sample size. Use an unsmoothed
mean for each ISO week across eligible complete reference years as the initial
descriptive baseline; leave weeks with no eligible samples missing. Evaluation
baselines use only prior years available at each origin. Do not label the spread
across historical years as a forecast confidence interval.

## Acceptance checklist

- Selecting an area updates the map and associated chart/calendar consistently.
- Sensor and date filters have visible effects and retain clear labels.
- Actual data dates and sources are visible.
- Historical observations, seasonal expectations, and forecasts are distinguishable.
- Raw detections are not labeled unique fires or burned area.
- Missing history, unknown coverage, and unavailable forecasts have useful states.
- At least one teammate outside the feature owner completes the full demo path.
- A saved dataset and a local/static app remain available if networking fails.
- The pitch distinguishes completed work, experimental results, and future work.

## Three-minute pitch

1. Problem: different sensors complicate comparison of burning activity over time.
2. Demo: choose an area, examine available activity, and inspect seasonal context.
3. Method: show sensor-aware preparation and explain what is and is not harmonized.
4. Evidence: present forecast results only if evaluated; otherwise show the baseline.
5. Next step: validated calibration, broader history, and prospective forecast testing.

## References

Visualization implementation choices, source snapshots, and selected examples:
[references/dominic-roye/README.md](../references/dominic-roye/README.md). Core views
are a weekly heatmap calendar, a platform-specific geographic map, and an
observed-versus-historical-average chart when history supports it. Decorative
effects, additional chart families, and animation are optional or deferred.

- Visual reference requested by the team: https://www.instagram.com/dr_xeo/
  Opened in the AI workspace; Instagram displayed a sign-up prompt. Specific
  posts have not been reviewed. Use as inspiration if accessible, without copying
  assets or attributing unreviewed techniques to the author.
- GeoPandas documentation: https://geopandas.org/en/stable/
- NASA FIRMS: https://firms.modaps.eosdis.nasa.gov/
- Local data documentation: [data/README.md](https://github.com/esauflores/llama-masters-research/blob/main/data/README.md)
- Modeling recommendation: [FORECASTING_PLAN.md](FORECASTING_PLAN.md)
- Globe and map implementation: [VISUALIZATION_PLAN.md](VISUALIZATION_PLAN.md)
