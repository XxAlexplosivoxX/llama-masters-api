"""World-wide inputs for clean.py, built once per run before the clean workers start (plan §3).

    <root>/reference/boundaries/adm1.parquet     state, state_id, iso, geom (geoBoundaries CGAZ ADM1)
    <root>/reference/country_cells.parquet       la, lo, country, n: owner of each 0.1° cell (n = its rows)
    <root>/reference/static_cells.parquet        family, la, lo: cells with static sources (type != 0)
    <root>/reference/cell_states.parquet         la, lo, state_id: 0.1° cells wholly inside one state
    <root>/reference/countries.parquet           country, rows, prepared_at: the work list for clean.py
    <root>/reference/fingerprint.parquet         archives + boundaries the tables above were built from
    <root>/staging/api/sensor=<s>/country=<C>/   the API rows, split by country

- The owner of a 0.1° cell is the country with the most archive detections in it, so every API row
  goes to exactly one country, the way NASA's archive files already do.
- Static-source cells come from archive rows with `type != 0`: 0.01° for MODIS, 0.005° for VIIRS.
- A cell is wholly inside a state when no state outline crosses it and its centre is in that
  state. clean.py takes the state of most points from this table and runs the exact
  point-in-polygon test only in border and coast cells, which is what keeps countries with long,
  detailed coastlines (Russia, Australia) as fast as the rest.
- The boundaries are downloaded once; --refresh-boundaries downloads them again.
- When the archives and boundaries match the stored fingerprint (file names, sizes, dates), the
  archive-derived tables are kept; likewise the API split is skipped when the API files and the
  cell owners are unchanged. --rebuild forces both.

Reads every archive file (~9 GB) and the API layer (~2 GB), so it runs on Railway, not on a laptop:
  python 2-process_data/src/prepare.py --root r2://llama-masters-firms
"""
import argparse
import os
import sys
import tempfile
import time
from datetime import UTC, datetime
from urllib.request import urlopen

import duckdb
import numpy as np
import shapely

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    BOUNDARIES,
    CELL_STATES,
    COUNTRIES,
    COUNTRY_CELLS,
    FINGERPRINT,
    MASK_CELLS,
    STATIC_CELLS,
    STATIC_CELLS_FILE,
    arrays,
    cell,
    connect,
    exists,
    files,
    is_remote,
    one,
    outlines,
    write_parquet,
)

API_FINGERPRINT = "reference/api_fingerprint.parquet"  # API files + cell owners the staging was split from
EPS = 1e-6  # in cells: a vertex on a cell edge marks both cells
KEY, OFFSET = 10_000, 2_000  # a cell (la, lo) packed as (la + OFFSET) * KEY + (lo + OFFSET)
CGAZ_ADM1 = ("https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/"
             "releaseData/CGAZ/geoBoundariesCGAZ_ADM1.gpkg")


def step(label: str, t0: float) -> None:
    print(f"{label} ({time.monotonic() - t0:.0f}s)", flush=True)


def save_boundaries(con: duckdb.DuckDBPyConnection, root: str, source: str | None, refresh: bool) -> None:
    """World ADM1 polygons with their bounding boxes (used to pre-filter nearest-state snapping)."""
    target = f"{root}/{BOUNDARIES}"
    if not source and not refresh and exists(con, target):
        print(f"boundaries: {target} exists, kept", flush=True)
        return
    if not source:
        source = os.path.join(tempfile.mkdtemp(prefix="bounds_"), "adm1.gpkg")
        with urlopen(CGAZ_ADM1, timeout=900) as response, open(source, "wb") as out:
            while chunk := response.read(1 << 20):
                out.write(chunk)
    con.execute(f"""
        CREATE TEMP TABLE boundaries AS
        SELECT shapeName AS state, shapeID AS state_id, shapeGroup AS iso,
               CASE WHEN ST_IsValid(geom) THEN geom ELSE ST_MakeValid(geom) END AS geom
        FROM ST_Read('{source}')""")
    con.execute("""ALTER TABLE boundaries ADD COLUMN xmin DOUBLE; ALTER TABLE boundaries ADD COLUMN xmax DOUBLE;
                   ALTER TABLE boundaries ADD COLUMN ymin DOUBLE; ALTER TABLE boundaries ADD COLUMN ymax DOUBLE;
                   UPDATE boundaries SET xmin = ST_XMin(geom), xmax = ST_XMax(geom),
                                         ymin = ST_YMin(geom), ymax = ST_YMax(geom)""")
    write_parquet(con, "SELECT * FROM boundaries", target)
    count, groups = one(con, "SELECT count(*), count(DISTINCT iso) FROM boundaries")
    print(f"boundaries: {count:,} ADM1 polygons in {groups} countries, saved to {target}", flush=True)
    con.execute("DROP TABLE boundaries")


def archive_points(root: str, extra: str = "") -> str:
    return (f"read_parquet('{root}/raw/sensor=*/country=*/part.parquet', hive_partitioning = true, "
            f"union_by_name = true{extra})")


def fingerprint(con: duckdb.DuckDBPyConnection, patterns: list[str]) -> str:
    """Hash of the files matching `patterns` (names, sizes, dates; contents are not read)."""
    return one(con, f"""
        SELECT md5(string_agg(filename || ':' || size || ':' || last_modified, ',' ORDER BY filename))
        FROM read_blob({patterns!r})""")[0]


def stored_fingerprint(con: duckdb.DuckDBPyConnection, path: str) -> str | None:
    return one(con, f"SELECT fingerprint FROM read_parquet('{path}')")[0] if exists(con, path) else None


def save_fingerprint(con: duckdb.DuckDBPyConnection, path: str, value: str) -> None:
    con.execute("CREATE OR REPLACE TEMP TABLE fp AS SELECT ? AS fingerprint", [value])
    write_parquet(con, "SELECT * FROM fp", path)


def unchanged(con: duckdb.DuckDBPyConnection, root: str, current: str) -> bool:
    """Whether the archive-derived tables were built from these same archives and boundaries."""
    outputs = (COUNTRY_CELLS, COUNTRIES, STATIC_CELLS_FILE, CELL_STATES)
    if not all(exists(con, f"{root}/{o}") for o in outputs):
        return False
    return stored_fingerprint(con, f"{root}/{FINGERPRINT}") == current


def restamp_countries(con: duckdb.DuckDBPyConnection, root: str, prepared_at: str) -> None:
    """The work list again with a new prepared_at, so the workers clean every country once more."""
    con.execute(f"CREATE TEMP TABLE countries AS SELECT country, rows FROM read_parquet('{root}/{COUNTRIES}')")
    write_parquet(con, f"SELECT country, rows, TIMESTAMP '{prepared_at}' AS prepared_at FROM countries",
                  f"{root}/{COUNTRIES}", order="rows DESC")
    con.execute("DROP TABLE countries")


def save_cells(con: duckdb.DuckDBPyConnection, root: str, prepared_at: str) -> None:
    """Country owner of each 0.1° cell, the countries work list, and the static-source cells."""
    t0 = time.monotonic()
    con.execute(f"""
        CREATE TEMP TABLE cells AS
        SELECT country, {cell('latitude', MASK_CELLS)} AS la, {cell('longitude', MASK_CELLS)} AS lo, count(*) AS n
        FROM {archive_points(root)} GROUP BY ALL""")
    write_parquet(con, "SELECT la, lo, arg_max(country, n) AS country, max(n) AS n FROM cells GROUP BY la, lo",
                  f"{root}/{COUNTRY_CELLS}", order="la, lo")
    write_parquet(con, f"SELECT country, sum(n) AS rows, TIMESTAMP '{prepared_at}' AS prepared_at "
                       "FROM cells GROUP BY country", f"{root}/{COUNTRIES}", order="rows DESC")
    countries, cells_count, rows = one(con, "SELECT count(DISTINCT country), count(DISTINCT (la, lo)), sum(n) "
                                            "FROM cells")
    step(f"country cells: {rows:,} archive rows, {countries} countries, {cells_count:,} cells of 0.1°", t0)
    con.execute("DROP TABLE cells")

    t0 = time.monotonic()
    family = "CASE WHEN sensor = 'modis' THEN 'modis' ELSE 'viirs' END"
    parts = " UNION ".join(
        f"SELECT DISTINCT '{fam}' AS family, {cell('latitude', per)} AS la, {cell('longitude', per)} AS lo "
        f"FROM {archive_points(root)} WHERE type <> 0 AND {family} = '{fam}'"
        for fam, per in STATIC_CELLS.items())
    write_parquet(con, parts, f"{root}/{STATIC_CELLS_FILE}", order="family, la, lo")
    count = one(con, f"SELECT count(*) FROM read_parquet('{root}/{STATIC_CELLS_FILE}')")[0]
    step(f"static cells: {count:,}", t0)


def piece_cells(ring: np.ndarray) -> np.ndarray:
    """Keys of the cells an outline ring (coordinates in cells) crosses: each segment is cut into
    pieces at most one cell long, and every cell in a piece's bounding box is marked."""
    start, delta = ring[:-1], np.diff(ring, axis=0)
    n = np.maximum(1, np.ceil(np.abs(delta).max(axis=1))).astype(np.int64)
    seg = np.repeat(np.arange(len(n)), n)
    k = (np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n))[:, None]
    a = start[seg] + delta[seg] * k / n[seg, None]
    b = start[seg] + delta[seg] * (k + 1) / n[seg, None]
    low = np.floor(np.minimum(a, b) - EPS).astype(np.int64)
    high = np.floor(np.maximum(a, b) + EPS).astype(np.int64)
    keys = []
    for dx in range(3):  # a piece spans at most 3 cells per axis (2 plus an edge on either side)
        for dy in range(3):
            ok = (low[:, 0] + dx <= high[:, 0]) & (low[:, 1] + dy <= high[:, 1])
            keys.append((low[ok, 1] + dy + OFFSET) * KEY + (low[ok, 0] + dx + OFFSET))
    return np.unique(np.concatenate(keys))


def border_cells(con: duckdb.DuckDBPyConnection) -> np.ndarray:
    """Keys (la, lo packed) of every 0.1° cell an ADM1 outline crosses, one polygon at a time so
    memory holds a single outline."""
    t0 = time.monotonic()
    found, vertices = [], 0
    for (wkb,) in con.execute("SELECT ST_AsWKB(geom) FROM world").fetchall():
        for ring in outlines(shapely.from_wkb([wkb]))[0]:
            coords = shapely.get_coordinates(ring) * MASK_CELLS
            vertices += len(coords)
            if len(coords) > 1:
                found.append(piece_cells(coords))
    keys = np.unique(np.concatenate(found)) if found else np.empty(0, dtype=np.int64)
    print(f"  border cells: {len(keys):,} from {vertices:,} outline vertices ({time.monotonic() - t0:.0f}s)",
          flush=True)
    return keys


def save_cell_states(con: duckdb.DuckDBPyConnection, root: str) -> None:
    """Cells wholly inside one state. Border cells: every cell in the bounding box of a piece of an
    outline segment, at most one cell long (a piece never leaves its box, so no crossed cell is
    missed). Every other cell lies wholly inside or wholly outside each state, so its centre decides."""
    t0 = time.monotonic()
    con.execute(f"CREATE TEMP TABLE world AS SELECT state_id, geom FROM read_parquet('{root}/{BOUNDARIES}')")
    keys = border_cells(con)  # noqa: F841 -- read by name in the SQL below (DuckDB scans the numpy array)
    con.execute(f"""CREATE TEMP TABLE border AS SELECT CAST(column0 // {KEY} - {OFFSET} AS INTEGER) AS la,
                    CAST(column0 % {KEY} - {OFFSET} AS INTEGER) AS lo FROM keys""")
    ids, wkb = zip(*con.execute("SELECT state_id, ST_AsWKB(geom) FROM world ORDER BY state_id").fetchall())
    geoms = shapely.from_wkb(list(wkb))
    shapely.prepare(geoms)
    tree = shapely.STRtree(geoms)
    cells = arrays(con, f"""SELECT la, lo FROM read_parquet('{root}/{COUNTRY_CELLS}') c
                            ANTI JOIN border b USING (la, lo)""")
    la, lo, sidx = cells["la"], cells["lo"], np.full(len(cells["la"]), -1, dtype=np.int64)
    for i in range(0, len(la), 1_000_000):  # bounded memory per chunk of cells
        x, y = (lo[i:i + 1_000_000] + 0.5) / MASK_CELLS, (la[i:i + 1_000_000] + 0.5) / MASK_CELLS
        pi, gi = tree.query(shapely.points(x, y))  # bounding-box candidates
        hit = shapely.contains_xy(geoms[gi], x[pi], y[pi])
        part = sidx[i:i + 1_000_000]
        best = np.full(len(x), len(geoms), dtype=np.int64)
        np.minimum.at(best, pi[hit], gi[hit])  # lowest state_id among the polygons holding the centre
        part[best < len(geoms)] = best[best < len(geoms)]
    ok = sidx >= 0
    inside = {"la": la[ok], "lo": lo[ok], "state_id": np.array(ids, dtype=object)[sidx[ok]]}
    con.register("inside", inside)
    write_parquet(con, "SELECT la, lo, CAST(state_id AS VARCHAR) AS state_id FROM inside", f"{root}/{CELL_STATES}",
                  order="la, lo")
    con.unregister("inside")
    inside, owned, border = one(con, f"""
        SELECT (SELECT count(*) FROM read_parquet('{root}/{CELL_STATES}')),
               (SELECT count(*) FROM read_parquet('{root}/{COUNTRY_CELLS}')), (SELECT count(*) FROM border)""")
    step(f"cell states: {inside:,} of {owned:,} country cells wholly inside one state "
         f"({inside / max(owned, 1):.0%}); {border:,} border cells", t0)
    con.execute("DROP TABLE world; DROP TABLE border")


def split_api(con: duckdb.DuckDBPyConnection, root: str, rebuild: bool) -> None:
    """API rows of the cells a country owns -> staging/api/sensor=<s>/country=<C>/part_0.parquet.
    Skipped when neither the API files nor the cell owners changed since the last split."""
    t0 = time.monotonic()
    pattern = f"{root}/raw/sensor=*/source=api/month=*/part.parquet"
    api = files(con, pattern)
    if not api:
        print("api: no files, nothing to split", flush=True)
        return
    current = fingerprint(con, [pattern, f"{root}/{COUNTRY_CELLS}"])
    if not rebuild and stored_fingerprint(con, f"{root}/{API_FINGERPRINT}") == current:
        step("api: files and cell owners unchanged since the last split, staging kept", t0)
        return
    if not is_remote(root):
        os.makedirs(f"{root}/staging", exist_ok=True)
    con.execute(f"CREATE TEMP TABLE owner AS SELECT * FROM read_parquet('{root}/{COUNTRY_CELLS}')")
    kept = one(con, f"""
        COPY (
            SELECT a.* EXCLUDE (source, month), o.country
            FROM read_parquet({api!r}, hive_partitioning = true, union_by_name = true) a
            JOIN owner o ON o.la = {cell('a.latitude', MASK_CELLS)} AND o.lo = {cell('a.longitude', MASK_CELLS)}
        ) TO '{root}/staging/api' (FORMAT parquet, COMPRESSION zstd, PARTITION_BY (sensor, country),
                                   OVERWRITE_OR_IGNORE, FILENAME_PATTERN 'part_{{i}}')""")[0]  # rows written
    total = one(con, f"SELECT sum(num_rows) FROM parquet_file_metadata({api!r})")[0]  # footers only
    save_fingerprint(con, f"{root}/{API_FINGERPRINT}", current)
    step(f"api: {total:,} rows in {len(api)} files, {kept:,} in a country's cells, split by country", t0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True, help="bucket root holding raw/, e.g. r2://llama-masters-firms")
    parser.add_argument("--boundaries-file", help="local ADM1 file (shapeName, shapeID, shapeGroup) instead of CGAZ")
    parser.add_argument("--refresh-boundaries", action="store_true", help="download the boundaries again")
    parser.add_argument("--rebuild", action="store_true",
                        help="rebuild the archive-derived tables even if archives and boundaries are unchanged")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--memory", default="4GB")
    args = parser.parse_args()
    args.root = args.root.rstrip("/")
    return args


def main() -> None:
    args = parse_args()
    t0 = time.monotonic()
    prepared_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    con = connect(args.root, args.threads, args.memory)
    save_boundaries(con, args.root, args.boundaries_file, args.refresh_boundaries)
    t1 = time.monotonic()
    current = fingerprint(con, [f"{args.root}/raw/sensor=*/country=*/part.parquet", f"{args.root}/{BOUNDARIES}"])
    if not args.rebuild and unchanged(con, args.root, current):
        restamp_countries(con, args.root, prepared_at)
        step("archives and boundaries unchanged: country cells, static cells and cell states kept", t1)
    else:
        save_cells(con, args.root, prepared_at)
        save_cell_states(con, args.root)
        save_fingerprint(con, f"{args.root}/{FINGERPRINT}", current)  # last: marks the tables complete
    split_api(con, args.root, args.rebuild)
    step(f"done: prepared at {prepared_at} UTC", t0)


if __name__ == "__main__":
    main()
