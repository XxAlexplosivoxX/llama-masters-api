# Data contract

The API stores and serves the region exports that llama-masters-research writes with
[`scripts/prepare_region.py`](https://github.com/esauflores/llama-masters-research/blob/main/scripts/prepare_region.py)
into `data/processed/<region>/`. The contract was first defined in
[the hackathon plan](plans/HACKATHON_PLAN.md#integration-contract); this page
describes what the exports contain and which rules the API enforces on upload.

## Files

| File | Upload part | Content |
|---|---|---|
| `metadata.json` | `metadata` | Sources, source coverage per sensor, units, week definition, quality rules and counts, harmonization status, limitations. Stored and served unchanged. |
| `areas.geojson` | `areas` | FeatureCollection of Polygon/MultiPolygon areas with `area_id` and `name` |
| `weekly_activity.json` | `weekly` | One row per area, ISO week and platform |
| `hotspots.geojson` | `hotspots` (optional) | Recent quality-filtered points |
| `index.json` | — | List of prepared regions; the API builds it from what it stores |

## How the exports are produced

These notes are copied from the research repo's
[data/README.md](https://github.com/esauflores/llama-masters-research/blob/main/data/README.md#app-exports).

- **Areas:** `--areas` takes a GeoJSON with `area_id` and `name` properties;
  without it, the extract's bbox is one area. Points on shared borders count in
  every area they touch.
- **Normalization:**
  - Platforms become `Terra`, `Aqua`, `S-NPP`, `NOAA-20`, `NOAA-21`.
  - Timestamps are UTC.
  - `processing` is `SP` or `NRT`.
  - Confidence becomes `low`/`nominal`/`high`, using FIRMS classes for MODIS
    percentages (below 30, 30–79, 80 and above).
- **Quality rules (defaults):**
  - Drop low confidence for each sensor.
  - Drop `type` 1–3 where the source reports it. NRT and API NRT records have no
    `type`, so volcanoes and gas flares remain in those periods.
  - `metadata.json` counts what each rule removed.
- **Weekly activity:**
  - One row per area, ISO week (Monday 00:00 UTC; `week_end` is the next Monday,
    exclusive) and platform.
  - `source_days` counts days with source data.
  - `reported_detections` is `null` when there are none, and a count otherwise
    (0 means none reported).
  - `week_complete` is false for weeks cut by the requested range or containing
    the extraction day; do not compare those with complete weeks.
  - `observation_coverage` is always `unknown`.
- **Hotspots:** points from the last `--hotspot-days` (default 7) of the range,
  rounded to 4 decimals (~11 m). For the whole Americas, 7 days is about 32 MB.
- **Baseline:** no seasonal baseline is produced yet; it needs several complete years.

## Weekly row

```json
{"area_id": "americas-2026-10", "week_start": "2026-11-02", "week_end": "2026-11-09",
 "iso_week": "2026-W45", "instrument": "VIIRS", "platform": "S-NPP",
 "reported_detections": 1245, "source_days": 1, "source_complete": false,
 "week_complete": true, "observation_coverage": "unknown"}
```

## Hotspot feature

```json
{"type": "Feature", "geometry": {"type": "Point", "coordinates": [-53.3837, -16.7674]},
 "properties": {"acquired_utc": "2026-11-08T00:24Z", "platform": "Terra", "confidence": "high",
                "frp": 23.0, "daynight": "N", "processing": "NRT", "area_ids": ["americas-2026-10"]}}
```

## Rules the API enforces

Implemented in [`internal/contract`](../internal/contract/contract.go).

- **Rejection.** An upload that breaks any rule gets `422` with every problem
  listed, and the region keeps its previous version.
- **Region name:** `[a-z0-9_-]+`.
- **Metadata:** `extract.request.start` and `end` are `YYYY-MM-DD` with start ≤ end.
- **Areas:**
  - A non-empty FeatureCollection.
  - Unique, non-empty `area_id` and `name`.
  - Polygon or MultiPolygon geometry with in-range coordinates.
- **Weekly rows:**
  - Known `area_id` and platform; `instrument` matches the platform (MODIS for
    Terra/Aqua, VIIRS otherwise).
  - `week_start` is a Monday, `week_end` is the following Monday, and `iso_week`
    matches `week_start`.
  - `source_days` is 0–7 and `source_complete` equals `source_days == 7`.
  - `reported_detections` is `null` **exactly** when `source_days` is 0, and
    never negative. A week without source data can therefore never be stored or
    served as 0.
  - No duplicate area/platform/week.
- **Hotspots:**
  - Point geometry with in-range coordinates.
  - `acquired_utc` like `2026-11-14T05:03Z`.
  - Known platform, `frp` present, and only known `area_ids`.

## Interpretation limits

- Detections are satellite hotspot pixels, not unique fires or burned area.
- Platforms are reported separately and are **not harmonized**.
- Satellite observation coverage (passes, clouds) is unknown.

See [CHALLENGE.md](CHALLENGE.md) for why these distinctions matter.
