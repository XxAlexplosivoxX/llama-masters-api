-- One row per region; current_version points at the version served to readers.
CREATE TABLE regions (
    name            TEXT PRIMARY KEY,
    current_version INTEGER NOT NULL,
    updated_at      TEXT NOT NULL
);

-- Every upload is a new version; older ones are pruned after a successful upload.
CREATE TABLE versions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    region        TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    sha256        TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL,
    start_date    TEXT NOT NULL,
    end_date      TEXT NOT NULL,
    hotspot_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX versions_region ON versions (region, id);

CREATE TABLE areas (
    version_id    INTEGER NOT NULL REFERENCES versions (id) ON DELETE CASCADE,
    area_id       TEXT NOT NULL,
    ord           INTEGER NOT NULL,
    name          TEXT NOT NULL,
    geometry_json TEXT NOT NULL,
    min_lon REAL NOT NULL, min_lat REAL NOT NULL, max_lon REAL NOT NULL, max_lat REAL NOT NULL,
    PRIMARY KEY (version_id, area_id)
);

-- reported_detections is NULL when the week had no source data (never 0).
CREATE TABLE weekly (
    version_id           INTEGER NOT NULL REFERENCES versions (id) ON DELETE CASCADE,
    area_id              TEXT NOT NULL,
    platform             TEXT NOT NULL,
    instrument           TEXT NOT NULL,
    iso_week             TEXT NOT NULL,
    week_start           TEXT NOT NULL,
    week_end             TEXT NOT NULL,
    reported_detections  INTEGER,
    source_days          INTEGER NOT NULL,
    source_complete      INTEGER NOT NULL,
    week_complete        INTEGER NOT NULL,
    observation_coverage TEXT NOT NULL
);
CREATE INDEX weekly_lookup ON weekly (version_id, area_id, platform, week_start);

CREATE TABLE hotspots (
    id           INTEGER PRIMARY KEY,
    version_id   INTEGER NOT NULL REFERENCES versions (id) ON DELETE CASCADE,
    lon          REAL NOT NULL,
    lat          REAL NOT NULL,
    acquired_utc TEXT NOT NULL,
    day          TEXT NOT NULL,
    platform     TEXT NOT NULL,
    confidence   TEXT NOT NULL,
    frp          REAL NOT NULL,
    daynight     TEXT NOT NULL,
    processing   TEXT NOT NULL
);
CREATE INDEX hotspots_platform_day ON hotspots (version_id, platform, day);
CREATE INDEX hotspots_lat_lon ON hotspots (version_id, lat, lon);

CREATE TABLE hotspot_areas (
    hotspot_id INTEGER NOT NULL REFERENCES hotspots (id) ON DELETE CASCADE,
    area_id    TEXT NOT NULL,
    PRIMARY KEY (hotspot_id, area_id)
);
CREATE INDEX hotspot_areas_area ON hotspot_areas (area_id, hotspot_id);
