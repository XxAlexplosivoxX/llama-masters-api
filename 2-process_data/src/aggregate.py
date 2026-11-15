"""Monthly counts country by country: clean/ -> aggregates/. Run after clean.py, before export.py.

    <root>/aggregates/country=<Country>/cells.parquet    satellite, x, y, state_id, month, n, provisional
    <root>/aggregates/country=<Country>/recent.parquet   the country's latest RECENT_DAYS days of points
    <root>/aggregates/_reports/country=<Country>/aggregate.parquet
                                                         per satellite: first_day, last_day, provisional_from, rows

`x`, `y` are the 0.1° cell (floor(lon * 10), floor(lat * 10)); `satellite` is Terra, Aqua, S-NPP,
NOAA-20 or NOAA-21; `provisional` counts the NRT rows among `n`. These tables are small (one row
per satellite, cell, state and month with detections), so export.py fits and writes every country
from them without touching clean/ again.

Workers take the same countries as clean.py (--shard K/N), so a worker runs `clean.py` and then
this script. A country is skipped when its aggregate report is newer than its cleaning report.

  python 2-process_data/src/aggregate.py --root r2://llama-masters-firms --shard 3/8
"""
import argparse
import os
import sys
import time

import duckdb

sys.path.insert(0, os.path.dirname(__file__))
from clean import JOB_ERRORS, shard_countries
from common import COUNTRIES, connect, exists, one, write_parquet

RECENT_DAYS = 7  # export.py keeps the world's last 7 days; each country keeps its own last 7 (a superset)


def report_times(con: duckdb.DuckDBPyConnection, pattern: str) -> dict[str, float]:
    """country -> last_modified (epoch seconds) of its report file."""
    rows = con.execute(f"""
        SELECT regexp_extract(filename, 'country=([^/]+)/', 1), epoch(last_modified)
        FROM read_blob('{pattern}')""").fetchall()
    return {str(country): float(seconds) for country, seconds in rows}


def aggregate_country(con: duckdb.DuckDBPyConnection, root: str, country: str, prepared_at: object) -> None:
    t0 = time.monotonic()
    rows = f"read_parquet('{root}/clean/country={country}/sensor=*/part.parquet')"
    out = f"{root}/aggregates/country={country}"
    write_parquet(con, f"""
        SELECT satellite, CAST(floor(CAST(longitude AS DOUBLE) * 10) AS SMALLINT) AS x,
               CAST(floor(CAST(latitude AS DOUBLE) * 10) AS SMALLINT) AS y, state_id,
               CAST(date_trunc('month', acq_date) AS DATE) AS month,
               CAST(count(*) AS INTEGER) AS n, CAST(count(*) FILTER (provisional) AS INTEGER) AS provisional
        FROM {rows} GROUP BY ALL""", f"{out}/cells.parquet", order="satellite, month, x, y")
    write_parquet(con, f"""
        SELECT latitude, longitude, acq_date, acq_time, satellite, confidence, frp, state_id
        FROM {rows}
        WHERE acq_date > (SELECT max(acq_date) FROM {rows}) - INTERVAL {RECENT_DAYS} DAY""",
                  f"{out}/recent.parquet", order="acq_date, acq_time")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE report AS
        SELECT CAST(? AS VARCHAR) AS country, satellite, min(acq_date) AS first_day, max(acq_date) AS last_day,
               min(acq_date) FILTER (provisional) AS provisional_from, count(*) AS rows, ? AS prepared_at
        FROM {rows} GROUP BY satellite""", [country, prepared_at])
    write_parquet(con, "SELECT * FROM report", f"{root}/aggregates/_reports/country={country}/aggregate.parquet",
                  order="satellite")
    cells = one(con, f"SELECT count(*), sum(n) FROM read_parquet('{out}/cells.parquet')")
    print(f"{country}: {cells[1] or 0:,} detections in {cells[0]:,} satellite-cell-state-months; "
          f"{time.monotonic() - t0:.1f}s", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True, help="bucket root holding clean/, e.g. r2://llama-masters-firms")
    parser.add_argument("--shard", default="1/1", help="K/N: this worker's share of the countries (as clean.py)")
    parser.add_argument("--country", help="aggregate only this country, even if done")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--memory", default="4GB")
    args, _ = parser.parse_known_args()  # a worker passes clean.py's arguments too (e.g. --sensors)
    args.root = args.root.rstrip("/")
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
        sys.exit(f"{root}/{COUNTRIES} missing: run prepare.py and clean.py first")
    countries = con.execute(f"SELECT country, rows FROM read_parquet('{root}/{COUNTRIES}')").fetchall()
    prepared_at = one(con, f"SELECT max(prepared_at) FROM read_parquet('{root}/{COUNTRIES}')")[0]
    cleaned = report_times(con, f"{root}/clean/_reports/country=*/cleaning.parquet")
    if args.country:
        todo = [args.country]
    else:
        mine = shard_countries(countries, args.shard, args.shards)
        done = report_times(con, f"{root}/aggregates/_reports/country=*/aggregate.parquet")
        missing = [c for c in mine if c not in cleaned]
        todo = [c for c in mine if c in cleaned and not (c in done and done[c] >= cleaned[c])]
        print(f"shard {args.shard}/{args.shards}: {len(mine)} countries, {len(mine) - len(todo) - len(missing)} "
              f"already aggregated, {len(missing)} not cleaned"
              + (f" ({', '.join(missing[:10])}{', ...' if len(missing) > 10 else ''})" if missing else ""), flush=True)
    failed = []
    for i, country in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] ", end="", flush=True)
        try:
            aggregate_country(con, root, country, prepared_at)
        except JOB_ERRORS as error:
            print(f"{country}: FAILED: {error}", flush=True)
            failed.append(country)
    print(f"done: {len(todo) - len(failed)} countries aggregated, {len(failed)} failed"
          + (f" ({', '.join(failed)})" if failed else ""), flush=True)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
