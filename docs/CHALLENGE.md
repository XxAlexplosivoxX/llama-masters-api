# Harmonization of MODIS and VIIRS Hot Spots

Challenge: [NASA Space Apps 2026 — MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/).
The official details were reviewed in Zen on November 14, 2026. This document
explains the challenge in plain language and separates its goals from our
proposed implementation.

## What problem are we solving?

Satellite records describe burning activity over more than two decades, including
wildfires and agricultural burning. However, the instruments differ, so their
detection counts cannot simply be joined into a consistent historical record.

The challenge has two connected parts:

1. Make MODIS and VIIRS hotspot records comparable across time.
2. Build a web application that turns that record into a burning activity calendar
   for an area and date range selected by the user.

The intended audience includes responders, scientists, and land managers. Users
should be able to examine seasonal patterns, compare years, and recognize
unusual activity. The brief also discusses downloadable analytics, visualizations,
and hotspot CSVs. Drawing an area and accessible color ramps are suggested
interface considerations. See the [official challenge](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/).

Our interpretation: historical comparability and a useful calendar are central.
Forecasting can extend the project, but does not substitute for those outputs.

## What are MODIS and VIIRS?

They are instruments carried by satellites, rather than names for individual
fires or forecasting models. They measure radiation from Earth; active-fire
products identify pixels with a thermal signal consistent with fire or another
hot source.

**MODIS** means **Moderate Resolution Imaging Spectroradiometer**. Instruments
fly on NASA's Terra and Aqua satellites and collect observations across visible
and infrared bands. Fire detection is one of many applications.
[NASA MODIS overview](https://science.nasa.gov/mission/aqua/modis/)

**VIIRS** means **Visible Infrared Imaging Radiometer Suite**. The FIRMS active-fire
products include observations from Suomi NPP, NOAA-20, and NOAA-21. Its 375 m
fire product captures finer detail and responds better to small fires than the
MODIS 1 km product, with improved nighttime performance.
[NASA VIIRS description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)

| Property | MODIS fire product | VIIRS fire product used here |
|---|---|---|
| Nominal spatial resolution | About 1 km | About 375 m |
| Platforms | Terra and Aqua | Suomi NPP, NOAA-20, NOAA-21 |
| Main contribution | Long historical record | Finer spatial detail and continuity |
| Confidence representation | Numeric value from 0 to 100 | Low, nominal, or high categories |

These are nominal fire-pixel sizes, not the minimum fire dimensions. Pixel
footprints vary with viewing geometry; a hotspot coordinate represents a pixel
center, not an exact fire boundary.
[MODIS fields](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html),
[VIIRS fields](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)

## Which satellite carries which sensor?

A **satellite/platform** is the spacecraft. A **sensor/instrument** is a measuring
device it carries. A **spectral band/channel** is a range of wavelengths measured
by that instrument. A **data product** is the processed result, such as the FIRMS
hotspot CSV. These are different levels of the system:

```text
Satellite → instrument → spectral measurements → fire-detection algorithm → hotspot product
```

| Satellite/platform | Relevant instrument | How it appears in this project |
|---|---|---|
| Terra | MODIS | Included in the combined MODIS CSV; preserve platform identity |
| Aqua | MODIS | Included in the combined MODIS CSV; preserve platform identity |
| Suomi NPP / S-NPP | VIIRS | Relevant to historical VIIRS data; absent from our saved current-feed catalog |
| NOAA-20 / JPSS-1 | VIIRS | Separate NOAA-20 VIIRS CSV (`J1`) |
| NOAA-21 / JPSS-2 | VIIRS | Separate NOAA-21 VIIRS CSV (`J2`) |

These satellites also carry other instruments; this table lists the ones relevant
to our hotspot records. NOAA-20 and NOAA-21 carry separate copies of VIIRS, so
their observations retain different platform identities and acquisition times.
[NASA FIRMS platform overview](https://firms.modaps.eosdis.nasa.gov/),
[our downloaded catalog and provenance](https://github.com/esauflores/llama-masters-research/blob/main/data/manifest.json)

### What measurements do the instruments contain?

MODIS has **36 spectral bands** spanning visible and infrared measurements.
The FIRMS fields include brightness temperature from band 21/22 and a second
temperature from band 31. Temperature fields are in kelvin; FRP, fire radiative
power, is in megawatts. These are processed measurements, not ordinary color
photographs. [NASA MODIS overview](https://science.nasa.gov/mission/aqua/modis/),
[MODIS fire-product fields](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html)

VIIRS has **22 spectral bands**: five imaging bands with nominal 375 m pixels,
16 moderate-resolution bands with nominal 750 m pixels, and a day/night band.
Thus, not every VIIRS measurement has 375 m resolution.
[NASA VIIRS band overview](https://earth.gsfc.nasa.gov/ocean/missions/noaa-21-viirs)

The VIIRS hotspot CSV includes brightness temperatures for **I4 and I5**. Its FRP
retrieval combines information from imaging and moderate-resolution bands. The
day/night band is a separate low-light measurement; it should not be confused
with the `daynight` field, which labels whether a detection occurred during day
or night. [NASA VIIRS fire-product fields](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)

For harmonization, keep **sensor + platform + processing version + acquisition
time**. Two records labeled VIIRS do not necessarily represent the same pass,
and adding another platform increases observation opportunities.

## What does a hotspot represent?

A hotspot is a reported thermal-anomaly detection. It is not automatically a
unique wildfire incident. Repeated passes can observe the same burning activity,
and one large fire can generate many detected pixels. Thermal anomalies also
include sources such as volcanoes and gas flares.
[NASA MODIS fire-product description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html)

For our application, distinguish these quantities:

- **Reported detections:** rows meeting the selected sensor-specific quality rules.
- **Unique incidents:** a different product requiring an explicit event-definition
  and validation process.
- **Burned area:** a surface-area estimate requiring suitable burned-area data or
  a separately validated method; multiplying detections by nominal pixel area
  does not produce it.

Our initial metric is reported detections per area and week, kept separate by
sensor/platform until a cross-sensor adjustment is justified.

## What is harmonization?

Harmonization means accounting for measurement differences so a change of sensor
does not masquerade as a change in burning activity.

Imagine that MODIS reports 10 detections and VIIRS reports 35 for the same area
and period. This hypothetical example does not establish a 3.5-fold increase in
burning. Finer pixels, different sensitivity, and different observation times can
contribute to the difference. Nor does it justify dividing every VIIRS count by
3.5 everywhere.

A proposed harmonization workflow is:

1. **Define the target.** Decide whether the output estimates detections on a
   reference-sensor scale, activity within spatial cells, or another validated
   measure. Document its units and limitations.
2. **Standardize records.** Align timestamps and field names; retain platform,
   processing version, confidence, and day/night information. Apply quality rules
   appropriate to each sensor rather than equating unlike confidence values.
3. **Match space and time.** Compare common areas and intervals during overlapping
   observation periods. Account for footprints and observation times when possible.
4. **Address observation opportunities.** Separate missing source data from zero
   reported detections. Supplement hotspot records with pass/cloud or observation
   coverage information when needed for a coverage-adjusted measure.
5. **Estimate sensor relationships.** Fit adjustments on overlap data, then test
   them on other periods and, when relevant, other regions.
6. **Check continuity and uncertainty.** Look for artificial jumps at sensor
   transitions and report where the adjustment performs poorly.

Shared fields, a common grid, or deduplication alone do not establish comparable
measurements. Deduplication also needs a defined purpose: repeated observations
are valid measurements even when they belong to the same fire.

## Possible solution approaches

The following are candidate approaches to investigate, not NASA-prescribed
methods or claims that calibration has already been completed.

| Approach | What it does | Practical limitation |
|---|---|---|
| Sensor-separated calendar | Uses common areas, intervals, and quality documentation while displaying each platform separately | Honest first prototype, but does not complete cross-sensor harmonization |
| Overlap-based statistical adjustment | Fits a regression or other calibration between matched platform measurements; may vary by region or season | Requires enough overlap and held-out validation; one global ratio is unlikely to be sufficient |
| Shared spatial-cell activity | Counts cells with detections over a defined interval, reducing dependence on the number of fine pixels | Still affected by sensitivity, cloud cover, and observation opportunities |
| Coverage-aware observation model | Models the underlying activity and each sensor's chance of observing it | More demanding data and validation; a longer-term research approach |

For a calibration experiment, start with a simple interpretable model. Test a
more flexible model such as XGBoost only if enough matched data exists and it
improves held-out performance. Estimating MODIS-equivalent detections would be
a reference-scale measurement, not ground-truth fire counts. Keep raw and
adjusted series available for inspection.

## What could the web application show?

Our proposed interface combines:

- **Geographic map:** select an area and inspect available observations. A globe
  is an optional overview with a 2D fallback.
- **Weekly calendar heatmap:** years as rows, ISO weeks as columns, with distinct
  states for missing and incomplete periods.
- **Historical comparison:** observed activity against a clearly defined reference
  average or median, with reference years and sample sizes visible.
- **Method and downloads:** explain the measure, sensor treatment, actual coverage,
  and processing versions; export the selected data and metadata.
- **Optional prediction:** a separately evaluated outlook, visibly distinguished
  from observations and historical expectations.

Comparable colors and matched dates support visual comparison; attractive maps
do not demonstrate scientific harmonization. Lower reported activity can reflect
observation limitations as well as less burning.

## Where do Nixtla and XGBoost fit?

They belong to modeling experiments after the target series is defined.
Forecasting estimates future activity; calibration estimates relationships
between measurements. Both can use machine learning, but they solve different
problems and need separate evaluation.

Our forecasting proposal compares a seasonal baseline with XGBoost through
MLForecast, with TimeGPT as an optional benchmark. None is assumed to be best
before testing. See [the forecasting plan](plans/FORECASTING_PLAN.md).

## What is realistic in our two-day hackathon?

Use one region with a few predefined areas. Prioritize real historical data,
platform-specific weekly aggregation, a usable calendar, and a transparent
overlap comparison. Add a calibrated cross-sensor series only if its adjustment
has supporting validation. Clearly identify unfinished harmonization.

The saved seven-day global MODIS/VIIRS snapshots support recent exploration;
they do not establish seasonal history. The plan requires usable historical data
by the hour-3 gate and three complete years for the seasonal-calendar branch.
With less history, show only descriptive activity over the available dates.
Recent-only mode is a partial challenge demo, not completion of the full brief.

Forecasting, extra regions, animation, and globe polish are optional. The detailed
scope and ownership are in [the hackathon plan](plans/HACKATHON_PLAN.md) and
[the visualization plan](plans/VISUALIZATION_PLAN.md).

## Data and further reading

### What the challenge HTML and video add

We inspected the page source, including its embedded application data, and
retrieved the embedded video's automatic English captions. The Resources tab
contains one explicit data-resource link: NASA Earthdata FIRMS. The video
broadly suggests CONAE and other agencies' resources but names no additional
dataset or download endpoint. Its Chilecito, Argentina, July 2026 fire example
is a possible case-study lead, not a supplied dataset.

The video reinforces the harmonization-plus-calendar structure; it does not
establish a required forecasting model or visualization library. These findings
are based on automatic captions, which may contain transcription errors.
See the [timestamped review and saved source files](references/challenge/README.md)
and [the original video](https://www.youtube.com/watch?v=tEPHsiZtuvk).

NASA's Fire Information for Resource Management System (FIRMS) distributes the
hotspot records. Custom archive requests require Earthdata or email
authentication; public recent downloads and country archive links are also
available. Check processing versions when combining historical science data
and recent observations. [NASA FIRMS archive download](https://firms.modaps.eosdis.nasa.gov/download/)

- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/)
- [Recent downloads](https://firms.modaps.eosdis.nasa.gov/active_fire/)
- [Country archives](https://firms.modaps.eosdis.nasa.gov/country/)
- [Our saved data, provenance, and refresh instructions](https://github.com/esauflores/llama-masters-research/blob/main/data/README.md)
- [All project plans](plans/README.md)
- [Visualization references](references/README.md)
