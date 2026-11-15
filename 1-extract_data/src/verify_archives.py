"""Verify the raw/ Parquet layer against NASA's yearly country archive index.

Checks, reading only Parquet footers except for the spot checks:
  1. coverage   every sensor/country in NASA's index has a part.parquet, and nothing extra
  2. years      each file's row groups span every year NASA lists for it
  3. density    rows per MB of source CSV is consistent within a sensor (truncation shows up as an outlier)
  4. spot       exact row counts of random sensor/country/years against NASA's CSVs

Each check prints a summary and returns a list of problems; the script exits 1 if there are any.

Usage: python 1-extract_data/src/verify_archives.py --dest r2://llama-masters-firms/raw [--spot 12]
(--spot downloads NASA CSVs, so it is off by default; run it on Railway)
"""
import argparse
import os
import random
import sys
from urllib.request import urlopen

sys.path.insert(0, os.path.dirname(__file__))
from archives import load_catalog
from common import BASE, connect

SENSOR_COUNTRY = "regexp_extract(file_name, 'sensor=([^/]+)', 1), regexp_extract(file_name, 'country=([^/]+)', 1)"


MB = 1e6
DENSITY_MIN_BYTES = 1e6  # smaller files are too noisy for the density check
SPOT_MAX_BYTES = 30e6  # spot checks download the CSV, so keep them small

def check_coverage(catalog, found):
    missing, extra = sorted(set(catalog) - set(found)), sorted(set(found) - set(catalog))
    print(f"1. coverage: {len(found)} files in dest, {len(catalog)} in NASA's index; "
          f"missing {len(missing)}, extra {len(extra)}")
    return [f"missing {m}" for m in missing] + [f"extra {e}" for e in extra]


def check_years(con, glob, catalog, found):
    """Years covered, from acq_date min/max of each row group (rows are sorted by date)."""
    spans = con.execute(f"""
        SELECT {SENSOR_COUNTRY}, year(CAST(stats_min_value AS DATE)), year(CAST(stats_max_value AS DATE))
        FROM parquet_metadata('{glob}') WHERE path_in_schema = 'acq_date'""").fetchall()
    years = {}
    for s, c, lo, hi in spans:
        years.setdefault((s, c), set()).update(range(lo, hi + 1))
    gaps = {k: sorted(set(v) - years.get(k, set())) for k, v in catalog.items() if k in found}
    gaps = {k: v for k, v in gaps.items() if v}
    print(f"2. years: {len(found) - len(gaps)} files cover every listed year; {len(gaps)} with missing years")
    return [f"years missing {k}: {v}" for k, v in sorted(gaps.items())]


def check_density(catalog, found, sensors):
    """Rows per MB of CSV, per sensor; only files over 1 MB, since small ones are noisy."""
    print("3. density (rows per MB of CSV, files > 1 MB): min / median / max")
    problems = []
    for sensor in sorted(sensors):
        d = sorted((found[k] / (sum(v.values()) / MB), k) for k, v in catalog.items()
                   if k[0] == sensor and k in found and sum(v.values()) > DENSITY_MIN_BYTES)
        if not d:
            continue
        med = d[len(d) // 2][0]
        print(f"   {sensor:12} {d[0][0]:8.0f} / {med:8.0f} / {d[-1][0]:8.0f}   ({len(d)} files)")
        problems += [f"density outlier {k}: {r:.0f} rows/MB vs median {med:.0f}" for r, k in d
                     if r < 0.8 * med or r > 1.25 * med]
    return problems


def check_spots(con, dest, catalog, found, count, seed):
    """Exact rows for random sensor/country/years against NASA's CSV (CSVs under 30 MB)."""
    pool = [(s, c, y) for (s, c), v in catalog.items() if (s, c) in found
            for y, size in v.items() if size < SPOT_MAX_BYTES]
    print(f"4. spot checks ({count} sensor/country/years, CSV < 30 MB):")
    problems = []
    for s, c, y in random.Random(seed).sample(pool, min(count, len(pool))):
        with urlopen(f"{BASE}/data/country/{s}/{y}/{s}_{y}_{c}.csv", timeout=300) as r:
            nasa = sum(1 for _ in r) - 1  # minus the header
        ours = con.execute(f"SELECT count(*) FROM read_parquet('{dest}/sensor={s}/country={c}/part.parquet') "
                           f"WHERE year(acq_date) = {y}").fetchone()[0]
        print(f"   {'ok' if nasa == ours else 'MISMATCH':8} {s:12} {c:30} {y}: NASA {nasa:,} / ours {ours:,}")
        if nasa != ours:
            problems.append(f"row mismatch {s} {c} {y}: NASA {nasa} vs {ours}")
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dest", required=True)
    parser.add_argument("--sensors", default="modis,viirs-snpp,viirs-jpss1")
    parser.add_argument("--spot", type=int, default=0, help="number of sensor/country/year spot checks")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    dest, sensors = args.dest.rstrip("/"), set(args.sensors.split(","))

    catalog = {k: v for k, v in load_catalog().items() if k[0] in sensors}
    con = connect(dest, threads=8, memory="1GB")
    glob = f"{dest}/sensor=*/country=*/part.parquet"
    rows = con.execute(f"SELECT {SENSOR_COUNTRY}, num_rows FROM parquet_file_metadata('{glob}')").fetchall()
    # {(sensor, country): rows} for the sensors being verified
    found = {(s, c): n for s, c, n in rows if s in sensors}

    problems = (check_coverage(catalog, found)
                + check_years(con, glob, catalog, found)
                + check_density(catalog, found, sensors)
                + check_spots(con, dest, catalog, found, args.spot, args.seed))

    print(f"\n{len(problems)} problem(s)")
    for p in problems[:50]:
        print("  -", p)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
