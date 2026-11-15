"""Extract NASA FIRMS yearly country archives into the `raw/` Parquet layer.

One Parquet file per sensor and country, holding every archived year:

    <dest>/sensor=<sensor>/country=<Country>/part.parquet

Rows keep NASA's columns, unfiltered (cleaning happens in the `clean/` layer), sorted
by acq_date, then latitude/longitude so DuckDB can skip row groups by date and place.
DuckDB streams the CSVs straight from NASA and writes Parquet straight to the
destination, so no local copy of the 50 GB of CSVs is needed.

Destinations:
  local folder        --dest data/raw-parquet
  Cloudflare R2       --dest r2://<bucket>/raw   (needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
                                                  R2_SECRET_ACCESS_KEY in the environment)

Reruns skip sensor/country files that already exist, so an interrupted run resumes.
A manifest row per file (rows, years, bytes read, seconds, status) goes to
<dest>/_manifest/run=<UTC timestamp>.parquet.

Examples:
  python 1-extract_data/src/archives.py --dest data/raw-parquet --countries El_Salvador
  python 1-extract_data/src/archives.py --dest r2://firms/raw --countries Venezuela,Brazil
  python 1-extract_data/src/archives.py --dest r2://firms/raw            # every country
"""
import argparse
import csv
import io
import os
import re
import signal
import sys
import time
from collections import defaultdict
from datetime import UTC, datetime
from urllib.request import urlopen

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    BASE,
    JOB_ERRORS,
    columns,
    connect,
    is_remote,
    parse_shard,
    write_parquet,
    written,
)

CATALOG_URL = f"{BASE}/data/country/yearly_summary_files.txt"
SENSORS = ("modis", "viirs-snpp", "viirs-jpss1", "viirs-jpss2")

def load_catalog():
    """{(sensor, country): {year: size}} from NASA's index of yearly country archives."""
    with urlopen(CATALOG_URL, timeout=120) as response:
        text = response.read().decode("utf-8")
    files = defaultdict(dict)
    for row in csv.DictReader(io.StringIO(text)):
        name = row["filename"]
        parts = name.removesuffix(".csv").split("_", 2)  # <sensor>_<year>_<Country>.csv
        if name.endswith(".csv") and len(parts) == 3 and parts[0] in SENSORS:
            files[parts[0], parts[2]][int(parts[1])] = int(row["size"])
    return files


def plan_jobs(catalog, sensors, countries):
    """(sensor, country, {year: size}) jobs, smallest first: quick early feedback,
    and a failure on a giant file comes last. Sorting by size also balances the shards."""
    jobs = [(s, c, years) for (s, c), years in catalog.items()
            if s in sensors and (countries is None or c in countries)]
    return sorted(jobs, key=lambda job: sum(job[2].values()))


def existing(con, dest):
    """(sensor, country) pairs already written."""
    paths = written(con, dest, "sensor=*/country=*/part.parquet")
    return {m.groups() for p in paths if (m := re.search(r"sensor=([^/]+)/country=([^/]+)/part\.parquet$", p))}


def extract_country(con, dest, sensor, country, years):
    """Write one sensor/country file from all its yearly CSVs; returns (rows, first day, last day)."""
    urls = [f"{BASE}/data/country/{sensor}/{y}/{sensor}_{y}_{country}.csv" for y in sorted(years)]
    target = f"{dest}/sensor={sensor}/country={country}/part.parquet"
    query = f"""
        SELECT {columns(sensor)}
        FROM read_csv(?, header = true, all_varchar = true, union_by_name = true)
    """
    write_parquet(con, query, [urls], target)
    return con.execute("SELECT count(*), min(acq_date), max(acq_date) FROM read_parquet(?)", [target]).fetchone()


def extract_all(con, dest, jobs, done, manifest):
    """Backfill each job not yet done, appending a manifest row per attempt."""
    for i, (sensor, country, years) in enumerate(jobs, 1):
        size = sum(years.values())
        label = f"[{i}/{len(jobs)}] {sensor} {country} ({size / 1e6:.1f} MB CSV)"
        if (sensor, country) in done:
            print(f"{label}: exists, skipped", flush=True)
            continue
        t0 = time.monotonic()
        try:
            rows, first, last = extract_country(con, dest, sensor, country, years)
            status, error = "ok", None
            print(f"{label}: {rows:,} rows {first}..{last} in {time.monotonic() - t0:.0f}s", flush=True)
        except JOB_ERRORS as exc:  # keep going; the manifest records the failure and a rerun retries it
            rows = first = last = None
            status, error = "failed", str(exc)[:500]
            print(f"{label}: FAILED {error}", file=sys.stderr, flush=True)
        manifest.append((sensor, country, min(years), max(years), size, rows, str(first), str(last),
                         round(time.monotonic() - t0, 1), status, error))


def write_manifest(con, dest, manifest, started):
    """Write the run's manifest (if anything was attempted); exit 1 if any file failed."""
    if not manifest:
        return
    con.execute("""CREATE TABLE manifest (sensor VARCHAR, country VARCHAR, first_year INT, last_year INT,
                   csv_bytes BIGINT, rows BIGINT, first_day VARCHAR, last_day VARCHAR, seconds DOUBLE,
                   status VARCHAR, error VARCHAR)""")
    con.executemany("INSERT INTO manifest VALUES (?,?,?,?,?,?,?,?,?,?,?)", manifest)
    path = f"{dest}/_manifest/run={started:%Y%m%dT%H%M%SZ}.parquet"
    if not is_remote(dest):
        os.makedirs(os.path.dirname(path), exist_ok=True)
    con.execute(f"COPY manifest TO '{path}' (FORMAT parquet)")
    failed = sum(1 for m in manifest if m[9] == "failed")
    print(f"manifest: {path} ({len(manifest)} files, {failed} failed)", flush=True)
    if failed:
        sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dest", required=True, help="local folder or r2://bucket/prefix")
    parser.add_argument("--countries", help="comma-separated archive names (e.g. Venezuela,El_Salvador); default all")
    parser.add_argument("--sensors", default="modis,viirs-snpp,viirs-jpss1", help=f"subset of {','.join(SENSORS)}")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--memory", default="2GB", help="DuckDB memory limit; spills to disk beyond it")
    parser.add_argument("--shard", default="1/1",
                        help="K/N: process only this worker's share of the files. Files are dealt round-robin "
                             "by size, so N workers get similar amounts of data and never overlap")
    parser.add_argument("--dry-run", action="store_true", help="list what would be written, with CSV sizes")
    args = parser.parse_args()
    args.dest = args.dest.rstrip("/")
    args.sensors = args.sensors.split(",")
    unknown = set(args.sensors) - set(SENSORS)
    if unknown:
        parser.error(f"unknown sensors: {', '.join(sorted(unknown))}")
    args.countries = set(args.countries.split(",")) if args.countries else None
    args.shard = parse_shard(parser, args.shard)
    return parser, args


def main():
    parser, args = parse_args()
    catalog = load_catalog()
    if args.countries:
        unknown = args.countries - {c for _, c in catalog}
        if unknown:
            parser.error(f"not in NASA's archive index: {', '.join(sorted(unknown))}")

    shard, shards = args.shard
    jobs = plan_jobs(catalog, args.sensors, args.countries)[shard - 1::shards]
    total = sum(sum(years.values()) for *_, years in jobs)
    print(f"shard {shard}/{shards}", flush=True)
    print(f"{len(jobs)} sensor/country files, {total / 1e9:.2f} GB of CSV to read", flush=True)
    if args.dry_run:
        for s, c, years in jobs:
            print(f"  {s:12} {c:35} {min(years)}-{max(years)}  {sum(years.values()) / 1e6:8.1f} MB")
        return

    con = connect(args.dest, args.threads, args.memory)
    done = existing(con, args.dest)
    manifest, started = [], datetime.now(UTC)
    # Railway stops containers with SIGTERM; turn it into SystemExit so the manifest is still written
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    try:
        extract_all(con, args.dest, jobs, done, manifest)
    finally:
        write_manifest(con, args.dest, manifest, started)


if __name__ == "__main__":
    main()
