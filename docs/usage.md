# Using the API

How to read the burning-activity data the API serves: for the web app, for
analysis, or to train a model. Reads are public and need no key. Uploading is
covered in the [README](../README.md#uploading).

## Base URL

The team instance runs on an Azure VM (Chile Central) with HTTPS, deployed with
[deploy/](../deploy/README.md):

```sh
API=https://68-211-179-63.sslip.io
curl "$API/healthz"          # {"status":"ok","writes_enabled":true}
```

The name comes from sslip.io, which resolves it to the VM's static IP. For a
local server, use `http://localhost:8080`.

## Regions

`GET /v1/regions` lists what is loaded. Use **`world`** unless you need one of
the source regions; it combines all of them, with one area per continent.

| Region | Range | Areas |
|---|---|---|
| `world` | 2000-11-01 to today | 9: `north-america`, `central-america`, `caribbean`, `south-america`, `europe`, `africa`, `asia`, `oceania`, `antarctica` |
| `americas-2000-2020`, `americas-2021-2025`, `americas-2026` | the years in the name | 1, the Americas bounding box |
| `americas-2026-10` | 2026-10-12 to today | 1, the Americas bounding box |
| `world-ex-americas-2024-2025`, `world-ex-americas-2026` | the years in the name | 1, the rest of the world |

**Data outside the Americas starts in 2024.** Weeks before that are `null` for
those continents. The Americas go back to November 2000.

```sh
curl "$API/v1/regions"
```

```json
[{"name": "world", "version": 12, "start": "2000-11-01", "end": "2026-11-14",
  "platforms": ["Aqua", "NOAA-20", "NOAA-21", "S-NPP", "Terra"], "areas": 9,
  "hotspots": {"first_day": "2026-11-13", "last_day": "2026-11-14", "features": 160726}}]
```

## Routes

| Route | Returns |
|---|---|
| `GET /v1/regions` | The region list above |
| `GET /v1/regions/{name}` | Version, upload time, SHA-256, and the region's `metadata` |
| `GET /v1/regions/{name}/areas` | GeoJSON FeatureCollection of areas (`area_id`, `name`) |
| `GET /v1/regions/{name}/weekly` | Weekly rows (JSON array) |
| `GET /v1/regions/{name}/hotspots` | Recent points (GeoJSON), newest first |
| `GET /healthz` | Server and database status |

### Weekly activity

This is the history: one row per area, ISO week and satellite platform.

| Parameter | Effect |
|---|---|
| `area_id` | One area, e.g. `south-america` |
| `platform` | `Terra`, `Aqua` (MODIS) or `S-NPP`, `NOAA-20`, `NOAA-21` (VIIRS) |
| `from`, `to` | `YYYY-MM-DD`, inclusive bounds on `week_start` |

```sh
curl "$API/v1/regions/world/weekly?area_id=central-america&platform=Aqua&from=2026-01-01"
```

```json
{"area_id": "central-america", "week_start": "2026-03-09", "week_end": "2026-03-16",
 "iso_week": "2026-W11", "instrument": "MODIS", "platform": "Aqua",
 "reported_detections": 355, "source_days": 7, "source_complete": true,
 "week_complete": true, "observation_coverage": "unknown"}
```

| Field | Meaning |
|---|---|
| `week_start`, `week_end` | Monday 00:00 UTC; `week_end` is the next Monday, exclusive |
| `reported_detections` | Quality-filtered detections that week. **`null` means no source data**, not zero; `0` means none detected |
| `source_days` | Days of the week (0–7) with data from that platform |
| `source_complete` | `source_days == 7` |
| `week_complete` | `false` when the week is cut by the region's range or still in progress |
| `observation_coverage` | Always `unknown`: passes and clouds are not accounted for |

Rules for using these numbers:
- **Keep `null` as a missing value.** Never fill it with 0. Platform start dates
  and instrument outages show up as `null` too.
- **Compare complete weeks only.** Rows with `week_complete: false` or
  `source_complete: false` have fewer days of data.
- **Do not add platforms together.** They are not harmonized: VIIRS reports
  roughly 7–10 times more detections than MODIS for the same fires, and several
  satellites can see the same fire. Model or chart each platform separately, or
  pick one: Aqua covers 2002 onwards, S-NPP 2012 onwards.
- **Detections are hotspot pixels,** not unique fires or burned area.

### Hotspots

The points behind the counts. Each region keeps only its **last few days**: 2
days for `world`, 7 for the Americas regions. For history, use the weekly rows.

| Parameter | Effect |
|---|---|
| `day` | One UTC day, `YYYY-MM-DD` |
| `from`, `to` | Inclusive UTC day range |
| `platform` | As for weekly |
| `area_id` | Points assigned to that area |
| `bbox` | `west,south,east,north` in degrees |
| `limit` | Maximum points, 1 to 200000; the default is 50000 |

```sh
curl --compressed "$API/v1/regions/world/hotspots?area_id=central-america&day=2026-11-13"
curl --compressed "$API/v1/regions/world/hotspots?bbox=-90.2,13.1,-87.6,14.5&limit=1000"
```

```json
{"type": "Feature", "geometry": {"type": "Point", "coordinates": [-90.6592, 16.7019]},
 "properties": {"acquired_utc": "2026-11-13T21:48Z", "platform": "Aqua", "confidence": "nominal",
                "frp": 6.22, "daynight": "D", "processing": "NRT", "area_ids": ["central-america"]}}
```

`frp` is fire radiative power in megawatts. `confidence` is `nominal` or
`high`: low-confidence points are removed. Coordinates are rounded to about 11 m.

**Check for truncation.** When more points match than `limit`, the response has
the header `X-Truncated: true`. A whole day of `world` exceeds the default, so
add `limit=200000`, or narrow by `area_id`, `platform` or `bbox`:

```sh
curl -s -o /dev/null -D - "$API/v1/regions/world/hotspots?day=2026-11-13" | grep -i x-truncated
```

### Metadata

`GET /v1/regions/{name}` returns the region's `metadata`, which contains:
- `sources`: the data sources;
- `extract.source_coverage`: which file or API request covers each day;
- `quality_rules` and `quality_counts`: what was filtered out;
- `limitations`.

Read it before publishing numbers.

## Example: weekly history in pandas

```python
import pandas as pd

API = "https://68-211-179-63.sslip.io"
weekly = pd.read_json(f"{API}/v1/regions/world/weekly?platform=Aqua", dtype={"reported_detections": "Int64"})
weekly["week_start"] = pd.to_datetime(weekly["week_start"])
complete = weekly[weekly["week_complete"] & weekly["source_complete"]]
yearly = (complete.assign(year=complete["week_start"].dt.year)
          .pivot_table(index="year", columns="area_id", values="reported_detections", aggfunc="sum"))
print(yearly.tail())
```

`Int64` keeps `null` as `<NA>`, instead of turning the column into floats.
A year with no data sums to `<NA>` (Africa before 2024). A year with only some
complete weeks, such as the current one, sums lower: count its weeks before
comparing years.

## Caching and conditional requests

- **Compression:** send `Accept-Encoding: gzip` (`curl --compressed`). Hotspot
  responses shrink about 20 times (10.5 MB to 0.55 MB for a day of Africa).
- **ETag:** each response has an `ETag`. Send it back in `If-None-Match`, and an
  unchanged response returns `304` with no body.
- **Cache-Control:** responses can be cached for 60 s and revalidated for 5 min.
- **New uploads:** an upload changes the region's `version` and takes effect
  immediately.

## Errors

Errors are JSON: `{"error": "..."}`.

| Status | Cause |
|---|---|
| `400` | Bad parameter: unknown platform, invalid date, `bbox` or `limit` |
| `404` | Unknown region |
| `401`, `413`, `422` | Uploads only: token, size, contract (see the README) |
