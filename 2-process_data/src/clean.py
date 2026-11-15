"""Clean hotspots country by country: raw/ -> clean/ (plan §3). Run prepare.py first.

    <root>/clean/country=<Country>/sensor=<sensor>/part.parquet
    <root>/clean/_reports/country=<Country>/cleaning.parquet

Workers split the countries of reference/countries.parquet with --shard K/N, balanced by archive
rows. A country already cleaned since the last prepare.py run is skipped, so a restarted worker
picks up where it stopped.

For each country and sensor, in this order:
  1. Rows: the country's archive file (already clipped by NASA), plus its API rows (split by
     prepare.py) after the archive's last day.
  2. Static sources (gas flares, volcanoes, offshore): `type != 0` where the column is filled;
     where it is not (NRT rows), the world static-source cells from prepare.py.
  3. Confidence: MODIS >= 30; VIIRS drops `low`.
  4. State: from the cell table when the point's 0.1° cell is wholly inside one of the country's
     states, else point in polygon (geoBoundaries CGAZ ADM1, shapely with prepared polygons) among
     the states of the country's ISO groups (from the rows of the cells it owns). Points just
     outside every polygon (coast, border) take the nearest state within SNAP_DEGREES; farther ones
     keep state NULL.

One query per sensor gives the report counts and the distinct border points; shapely places
those; a second pass joins them back and writes the rows (unsorted; aggregate sorts).

Rows keep latitude/longitude (float32), date, time, satellite, confidence, frp, state, state_id,
iso, `source` (archive/api) and `provisional` (NRT).

On Railway (reads every archive file, so not on a laptop):
  python 2-process_data/src/clean.py --root r2://llama-masters-firms --shard 3/8
  python 2-process_data/src/clean.py --root r2://llama-masters-firms --country Venezuela
"""
import argparse
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import duckdb
import numpy as np
import shapely

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    BOUNDARIES,
    CELL_STATES,
    COUNTRIES,
    COUNTRY_CELLS,
    MASK_CELLS,
    SENSORS,
    STATIC_CELLS,
    STATIC_CELLS_FILE,
    arrays,
    cell,
    connect,
    exists,
    family,
    files,
    one,
    outlines,
    write_parquet,
)

JOB_ERRORS = (duckdb.Error, OSError, ValueError, RuntimeError)
SNAP_DEGREES = 0.1  # nearest-state snapping for points just outside every polygon
MODIS_MIN_CONFIDENCE = 30
ISO_MIN_SHARE = 0.05  # an ISO group needs this share of the country's archive rows to count
COUNTS = ("archive_rows", "api_rows", "static_by_type", "static_by_mask", "low_confidence")  # report columns
EXACT_CHUNK = 50_000  # border points per exact-test task
FIELDS = "latitude, longitude, acq_date, acq_time, satellite, confidence, frp, type"


# --- Work list ----------------------------------------------------------------------------------

def shard_countries(countries: list[tuple[str, int]], shard: int, shards: int) -> list[str]:
    """Largest first, each to the least loaded worker, so the workers finish close together."""
    loads = [0] * shards
    mine = []
    for country, rows in sorted(countries, key=lambda c: (-c[1], c[0])):
        worker = loads.index(min(loads))
        loads[worker] += rows
        if worker == shard - 1:
            mine.append(country)
    return mine


def cleaned(con: duckdb.DuckDBPyConnection, root: str, prepared_at: object) -> set[str]:
    """Countries whose report comes from the current prepare.py run."""
    reports = files(con, f"{root}/clean/_reports/country=*/cleaning.parquet")
    if not reports:
        return set()
    try:
        rows = con.execute(f"SELECT DISTINCT country FROM read_parquet({reports!r}, union_by_name = true) "
                           "WHERE prepared_at = ?", [prepared_at]).fetchall()
    except duckdb.BinderException:  # only reports from before prepare.py existed
        return set()
    return {r[0] for r in rows}


# --- One country --------------------------------------------------------------------------------

class Inputs:
    """Archive and staged API files, listed once per run (two R2 listings instead of several per country)."""

    def __init__(self, con: duckdb.DuckDBPyConnection, root: str) -> None:
        self.root = root
        self.archives = set(files(con, f"{root}/raw/sensor=*/country=*/part.parquet"))
        self.staged: dict[tuple[str, str], list[str]] = {}
        for path in files(con, f"{root}/staging/api/sensor=*/country=*/*.parquet"):
            sensor, country = path.split("/sensor=")[1].split("/country=")
            self.staged.setdefault((sensor, country.split("/")[0]), []).append(path)

    def archive(self, sensor: str, country: str) -> str | None:
        path = f"{self.root}/raw/sensor={sensor}/country={country}/part.parquet"
        return path if path in self.archives else None


def iso_groups(con: duckdb.DuckDBPyConnection, country: str) -> list[str]:
    """ISO groups holding the country's archive rows, from the cells it owns: the cell table where a
    cell is wholly inside a state, else (tiny or coastal countries) the state nearest each cell centre."""
    query = """
        WITH found AS ({found})
        SELECT iso FROM found GROUP BY iso HAVING sum(n) >= {share} * (SELECT sum(n) FROM found)
        ORDER BY sum(n) DESC"""
    inside = """SELECT w.iso, o.n FROM owned o JOIN cell_states c USING (la, lo)
                 JOIN (SELECT state_id, iso FROM world) w USING (state_id) WHERE o.country = $country"""
    groups = con.execute(query.format(found=inside, share=ISO_MIN_SHARE), {"country": country}).fetchall()
    if not groups:
        near = f"""SELECT arg_min(w.iso, ST_Distance(w.geom, p)) AS iso, any_value(o.n) AS n
                   FROM (SELECT *, ST_Point((lo + 0.5) / {MASK_CELLS}, (la + 0.5) / {MASK_CELLS}) AS p
                         FROM owned WHERE country = $country) o
                   JOIN world w ON ST_DWithin(w.geom, o.p, {2 * SNAP_DEGREES}) GROUP BY o.la, o.lo"""
        groups = con.execute(query.format(found=near, share=ISO_MIN_SHARE), {"country": country}).fetchall()
    return [g[0] for g in groups]


def load_states(con: duckdb.DuckDBPyConnection, country: str) -> tuple[list[str], dict]:
    """Table `states` (sidx = position by state_id), table `cells` (la, lo, sidx) for the country's
    states, and the polygons for the exact test (WKB, prepared once per thread)."""
    isos = iso_groups(con, country)
    con.execute("""CREATE OR REPLACE TEMP TABLE states AS
                   SELECT CAST(row_number() OVER (ORDER BY state_id) - 1 AS SMALLINT) AS sidx, *
                   FROM world WHERE list_contains(?, iso)""", [isos])
    con.execute("CREATE OR REPLACE TEMP TABLE cells AS SELECT c.la, c.lo, s.sidx FROM cell_states c JOIN states s USING (state_id)")
    geoms = shapely.from_wkb([w for (w,) in con.execute("SELECT ST_AsWKB(geom) FROM states ORDER BY sidx").fetchall()])
    return isos, {"wkb": shapely.to_wkb(geoms), "local": threading.local()}


def polygons(poly: dict) -> dict:
    """This thread's prepared polygons and trees: GEOS builds prepared-geometry indexes lazily, so
    threads must not share them."""
    mine = poly["local"]
    if not hasattr(mine, "geoms"):
        mine.geoms = shapely.from_wkb(poly["wkb"])
        shapely.prepare(mine.geoms)
        mine.tree = shapely.STRtree(mine.geoms)
        pieces, mine.owner = outline_pieces(mine.geoms)
        mine.pieces = shapely.STRtree(pieces)
    return mine.__dict__


def outline_pieces(geoms: np.ndarray, size: int = 16) -> tuple[np.ndarray, np.ndarray]:
    """The polygon outlines cut into linestrings of at most `size` segments, and the polygon of each,
    so nearest-state snapping costs ~log(vertices) per point instead of a scan of every outline."""
    rings, ring_owner = outlines(geoms)  # with the LineString slivers MakeValid can leave: ST_Distance sees them
    lines, owner = [], []
    for ring, k in zip(rings, ring_owner, strict=True):
        c = shapely.get_coordinates(ring)
        starts = np.arange(0, len(c) - 1, size)
        lengths = np.minimum(starts + size, len(c) - 1) - starts + 1  # pieces share their end vertex
        flat = np.repeat(starts, lengths) + np.arange(lengths.sum()) - np.repeat(np.cumsum(lengths) - lengths, lengths)
        lines.append(shapely.linestrings(c[flat], indices=np.repeat(np.arange(len(starts)), lengths)))
        owner.append(np.full(len(starts), k))
    if not lines:
        return np.empty(0, dtype=object), np.empty(0, dtype=np.int64)
    return np.concatenate(lines), np.concatenate(owner)


def sources(con: duckdb.DuckDBPyConnection, inputs: Inputs, sensor: str, country: str) -> str:
    """SQL for the archive rows plus the country's API rows after the archive's last day."""
    parts = [f"SELECT {FIELDS}, 'SP' AS processing, 'archive' AS source FROM empty_rows"]
    after = ""
    archive = inputs.archive(sensor, country)
    if archive:
        parts.append(f"SELECT {FIELDS}, 'SP' AS processing, 'archive' AS source FROM read_parquet('{archive}')")
        last = one(con, f"SELECT max(acq_date) FROM read_parquet('{archive}')")[0]
        after = f"WHERE acq_date > DATE '{last}'"
    api = inputs.staged.get((sensor, country))
    if api:
        parts.append(f"SELECT {FIELDS}, processing, 'api' AS source "
                     f"FROM read_parquet({api!r}, union_by_name = true) {after}")
    return " UNION ALL BY NAME ".join(parts)


def flagged(sensor: str, rows: str) -> str:
    """SQL: rows plus `static`, `static_by_mask`, `low_confidence` and `sidx` (from the cell table)."""
    fam = family(sensor)
    per_degree = STATIC_CELLS[fam]
    low = (f"TRY_CAST(confidence AS INTEGER) < {MODIS_MIN_CONFIDENCE}" if fam == "modis"
           else "lower(left(confidence, 1)) = 'l'")
    return f"""
        SELECT r.*, CASE WHEN r.type IS NOT NULL THEN r.type <> 0 ELSE m.la IS NOT NULL END AS static,
               r.type IS NULL AND m.la IS NOT NULL AS static_by_mask,
               coalesce({low}, false) AS low_confidence, c.sidx
        FROM ({rows}) r
        LEFT JOIN static_cells m ON m.family = '{fam}'
         AND m.la = {cell('r.latitude', per_degree)} AND m.lo = {cell('r.longitude', per_degree)}
        LEFT JOIN cells c ON c.la = {cell('r.latitude', MASK_CELLS)} AND c.lo = {cell('r.longitude', MASK_CELLS)}"""


def exact_states(pool: ThreadPoolExecutor, poly: dict, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """sidx per point (-1 = none), in parallel chunks (shapely releases the GIL). The pool lives for
    the whole run, so each thread prepares a country's polygons once, not once per sensor."""
    if not len(x) or not len(poly["wkb"]):
        return np.full(len(x), -1, dtype=np.int64)
    starts = range(0, len(x), EXACT_CHUNK)
    chunks = pool.map(lambda i: exact_chunk(poly, x[i:i + EXACT_CHUNK], y[i:i + EXACT_CHUNK]), starts)
    return np.concatenate(list(chunks))


def exact_chunk(poly: dict, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """The lowest-sidx polygon that contains each point, else the nearest state within SNAP_DEGREES.
    Prepared polygons and STRtrees, so each point costs ~log(vertices) instead of a full outline scan."""
    poly = polygons(poly)
    geoms, out = poly["geoms"], np.full(len(x), -1, dtype=np.int64)
    pi, gi = poly["tree"].query(shapely.points(x, y))  # bounding-box candidates
    hit = shapely.contains_xy(geoms[gi], x[pi], y[pi])
    best = np.full(len(x), len(geoms), dtype=np.int64)
    np.minimum.at(best, pi[hit], gi[hit])  # a point on an overlap of two polygons keeps the lowest state_id
    out[best < len(geoms)] = best[best < len(geoms)]
    miss = np.flatnonzero(out < 0)
    if len(miss) and len(poly["owner"]):
        qi, qp = poly["pieces"].query_nearest(shapely.points(x[miss], y[miss]), max_distance=SNAP_DEGREES,
                                               all_matches=False)
        out[miss[qi]] = poly["owner"][qp]
    return out


def _day(values: np.ndarray, pick):
    """min/max of a fetched DATE column as datetime.date (None when empty)."""
    days = [d for d in np.asarray(values, dtype="datetime64[D]").tolist() if d is not None]
    return pick(days) if days else None


def satellite_label(sensor: str) -> str:
    if sensor == "modis":
        return "CASE upper(left(satellite, 1)) WHEN 'T' THEN 'Terra' WHEN 'A' THEN 'Aqua' ELSE satellite END"
    return f"'{SENSORS[sensor]}'"


def clean_sensor(con: duckdb.DuckDBPyConnection, inputs: Inputs, pool: ThreadPoolExecutor, country: str,
                 sensor: str, poly: dict) -> dict:
    t0 = time.monotonic()
    f = flagged(sensor, sources(con, inputs, sensor, country))
    # one pass: report counts plus the distinct points that need the exact test (border rows); every
    # other row falls in the group whose point is NULL
    g = arrays(con, f"""
        SELECT CASE WHEN border THEN longitude END AS longitude, CASE WHEN border THEN latitude END AS latitude,
               count(*) FILTER (border) AS n,
               count(*) FILTER (source = 'archive') AS archive_rows, count(*) FILTER (source = 'api') AS api_rows,
               count(*) FILTER (static AND NOT static_by_mask) AS static_by_type,
               count(*) FILTER (static_by_mask) AS static_by_mask,
               count(*) FILTER (low_confidence AND NOT static) AS low_confidence,
               min(acq_date) AS first_day, max(acq_date) AS last_day,
               count(*) FILTER (NOT static AND NOT low_confidence) AS kept
        FROM (SELECT *, NOT static AND NOT low_confidence AND sidx IS NULL AS border FROM ({f}))
        GROUP BY ALL""")
    pts = ~np.isnan(g["longitude"]) if len(g["n"]) else np.zeros(0, bool)
    border = {"longitude": g["longitude"][pts], "latitude": g["latitude"][pts], "n": g["n"][pts]}
    counts = {k: int(g[k].sum()) for k in COUNTS}
    kept = int(g["kept"].sum())
    sidx = exact_states(pool, poly, border["longitude"], border["latitude"])
    exact = int(border["n"].sum())
    no_state = int(border["n"][sidx < 0].sum())
    ok = sidx >= 0
    con.register("hits", {"longitude": border["longitude"][ok], "latitude": border["latitude"][ok],
                          "hsidx": sidx[ok].astype(np.int16)})
    write_parquet(con, f"""
        SELECT CAST(f.latitude AS FLOAT) AS latitude, CAST(f.longitude AS FLOAT) AS longitude, acq_date, acq_time,
               {satellite_label(sensor)} AS satellite, confidence, frp, s.state, s.state_id, s.iso, source,
               processing = 'NRT' AS provisional
        FROM ({f}) f
        LEFT JOIN hits h ON f.sidx IS NULL AND h.longitude = f.longitude AND h.latitude = f.latitude
        LEFT JOIN states s ON s.sidx = coalesce(f.sidx, h.hsidx)
        WHERE NOT static AND NOT low_confidence""", f"{inputs.root}/clean/country={country}/sensor={sensor}/part.parquet")
    # unsorted on purpose: a global sort is the one blocking step (~3.5 GB at 35M rows); aggregate sorts
    con.unregister("hits")
    row = {"country": country, "sensor": sensor, **counts,
           "first_day": _day(g["first_day"], min), "last_day": _day(g["last_day"], max), "kept": kept, "exact_test": exact, "no_state": no_state, "seconds": round(time.monotonic() - t0, 1)}
    total = counts["archive_rows"] + counts["api_rows"]
    print(f"  {sensor}: {total:,} rows ({counts['archive_rows']:,} archive + {counts['api_rows']:,} api); "
          f"removed static {counts['static_by_type']:,} by type + {counts['static_by_mask']:,} by mask, "
          f"low confidence {counts['low_confidence']:,}; kept {kept:,} ({kept / max(total, 1):.1%}), "
          f"exact test {exact:,}, no state {no_state:,}; {row['seconds']}s", flush=True)
    return row


def clean_country(con: duckdb.DuckDBPyConnection, inputs: Inputs, pool: ThreadPoolExecutor, country: str,
                  sensors: list[str], prepared_at: object) -> None:
    t0 = time.monotonic()
    archives = [s for s in SENSORS if inputs.archive(s, country)]
    if not archives:
        raise RuntimeError(f"no archive files for {country} under {inputs.root}/raw")
    isos, poly = load_states(con, country)
    count = one(con, "SELECT count(*) FROM states")[0]
    print(f"{country}: {count} states in {', '.join(isos) or 'no ISO group'}; "
          f"archives for {', '.join(archives)}", flush=True)
    rows = [clean_sensor(con, inputs, pool, country, s, poly) for s in sensors]
    for row in rows:
        row.update(iso=",".join(isos), prepared_at=prepared_at)
    con.execute("CREATE OR REPLACE TEMP TABLE report AS SELECT * FROM (SELECT unnest(?, recursive := true))",
                [rows])
    write_parquet(con, "SELECT * FROM report", f"{inputs.root}/clean/_reports/country={country}/cleaning.parquet")
    print(f"{country}: done in {time.monotonic() - t0:.0f}s", flush=True)


# --- Run ----------------------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True, help="bucket root holding raw/, e.g. r2://llama-masters-firms")
    parser.add_argument("--shard", default="1/1", help="K/N: this worker's share of the countries")
    parser.add_argument("--country", help="clean only this archive country (e.g. Venezuela), even if done")
    parser.add_argument("--sensors", default=",".join(SENSORS), help="comma-separated sensor folders")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--memory", default="4GB")
    args = parser.parse_args()
    args.root = args.root.rstrip("/")
    args.sensors = args.sensors.split(",")
    unknown = set(args.sensors) - set(SENSORS)
    if unknown:
        parser.error(f"unknown sensors: {', '.join(sorted(unknown))}")
    try:
        args.shard, args.shards = (int(x) for x in args.shard.split("/"))
    except ValueError:
        parser.error("--shard must look like 3/8")
    if not 1 <= args.shard <= args.shards:
        parser.error("--shard K/N needs 1 <= K <= N")
    return args


def main() -> None:
    args = parse_args()
    root = args.root
    con = connect(root, args.threads, args.memory)
    if not exists(con, f"{root}/{COUNTRIES}"):
        sys.exit(f"{root}/{COUNTRIES} missing: run prepare.py first")
    countries = con.execute(f"SELECT country, rows FROM read_parquet('{root}/{COUNTRIES}')").fetchall()
    prepared_at = one(con, f"SELECT max(prepared_at) FROM read_parquet('{root}/{COUNTRIES}')")[0]
    if args.country:
        todo = [args.country]
    else:
        mine = shard_countries(countries, args.shard, args.shards)
        done = cleaned(con, root, prepared_at)
        todo = [c for c in mine if c not in done]
        print(f"shard {args.shard}/{args.shards}: {len(mine)} countries, {len(mine) - len(todo)} already cleaned "
              f"since {prepared_at}", flush=True)
    con.execute(f"CREATE TEMP TABLE world AS SELECT * FROM read_parquet('{root}/{BOUNDARIES}')")
    con.execute(f"CREATE TEMP TABLE cell_states AS SELECT * FROM read_parquet('{root}/{CELL_STATES}')")
    con.execute(f"CREATE TEMP TABLE owned AS SELECT * FROM read_parquet('{root}/{COUNTRY_CELLS}')")
    con.execute(f"CREATE TEMP TABLE static_cells AS SELECT * FROM read_parquet('{root}/{STATIC_CELLS_FILE}')")
    inputs = Inputs(con, root)
    pool = ThreadPoolExecutor(args.threads)
    con.execute("CREATE TEMP TABLE empty_rows (latitude DOUBLE, longitude DOUBLE, acq_date DATE, acq_time VARCHAR, "
                "satellite VARCHAR, confidence VARCHAR, frp FLOAT, type TINYINT)")  # fixes the column types
    failed = []
    for i, country in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] ", end="", flush=True)
        try:
            clean_country(con, inputs, pool, country, args.sensors, prepared_at)
        except JOB_ERRORS as error:
            print(f"{country}: FAILED: {error}", flush=True)
            failed.append(country)
    print(f"done: {len(todo) - len(failed)} countries cleaned, {len(failed)} failed"
          + (f" ({', '.join(failed)})" if failed else ""), flush=True)
    if failed:
        sys.exit(1)  # Railway restarts on failure; cleaned countries are skipped


if __name__ == "__main__":
    main()
