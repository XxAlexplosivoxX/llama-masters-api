"""Extract NASA FIRMS area-API data (whole world) into the raw/ Parquet layer, one file per month.

For sensors and days without yearly country archives: NOAA-21 (API only) and the months
after the latest archive year for every sensor.

    <dest>/sensor=<sensor>/source=api/month=<YYYY-MM>/part.parquet

SP vs NRT: each day comes from standard processing (SP) where the API's data_availability
lists it, otherwise near-real-time (NRT); a `processing` column says which. Rows are not
assigned to countries (the API works by area), and NRT rows have no `type`; both are
handled in clean/.

Transaction budget: requests cover the whole world, up to 5 days at a time (the API maximum),
and cost about COST_PER_DAY transactions per day out of the key's budget per 10-minute window.
Before each request the free mapkey_status call checks the budget and waits until there is
room, so several workers can share one key. Over the limit the API answers HTTP 400, so a 400
while the budget is nearly spent means wait and retry. The MAP_KEY is read from FIRMS_MAP_KEY,
else FIRMS_MAP_KEY_<K> for --shard K/N (a key per worker), and redacted from every message.

Only changed days are downloaded, because the budget is the bottleneck. Each month file's
footer records which days it holds and from which source (SP or NRT), plus the last NRT day
known to be complete. A rerun fetches only the days that are missing, stored as NRT now that
SP covers them, or stored as NRT while they were still the newest (possibly partial) NRT day.
Every other day is copied from the existing file. While a month downloads, the file is saved
at least every CHECKPOINT_SECONDS, so an interrupted run loses at most that much work.

Examples:
  python 1-extract_data/src/api.py --dest r2://llama-masters-firms/raw --sensors viirs-jpss2
  python 1-extract_data/src/api.py --dest r2://llama-masters-firms/raw \
      --sensors modis,viirs-snpp,viirs-jpss1 --start 2026-01-01
  python 1-extract_data/src/api.py --dest data/raw-parquet --sensor viirs-jpss2 \
      --start 2024-01-01 --end 2024-01-31
"""
import argparse
import csv
import io
import json
import os
import re
import shutil
import sys
import tempfile
import time
from datetime import UTC, date, datetime, timedelta
from http import HTTPStatus
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

sys.path.insert(0, os.path.dirname(__file__))
from common import BASE, JOB_ERRORS, columns, connect, parse_shard, write_parquet, written

API_DAYS = 5  # most days one area request may cover
COST_PER_DAY = 45  # transactions per world-day, measured (262 for 7 days) plus margin
DEFAULT_LIMIT = 5000  # transactions per 10 minutes, when mapkey_status doesn't say
POLL_SECONDS = 15  # between budget checks while waiting
CHECKPOINT_SECONDS = 60  # save a month in progress at least this often
# CLI sensor name (archive naming) -> API source prefix
SOURCES = {"modis": "MODIS", "viirs-snpp": "VIIRS_SNPP", "viirs-jpss1": "VIIRS_NOAA20", "viirs-jpss2": "VIIRS_NOAA21"}
NETWORK_ERRORS = (URLError, TimeoutError, ConnectionError)  # URLError includes HTTPError
MONTH_FILE = re.compile(r"sensor=([^/]+)/source=api/month=([^/]+)/part\.parquet$")


# --- API access -------------------------------------------------------------------------------

def map_key(shard):
    """FIRMS_MAP_KEY, else FIRMS_MAP_KEY_<shard>: one key per worker multiplies the budget,
    while Railway services that set FIRMS_MAP_KEY directly keep working."""
    key = os.environ.get("FIRMS_MAP_KEY") or os.environ.get(f"FIRMS_MAP_KEY_{shard}")
    if not key:
        sys.exit(f"neither FIRMS_MAP_KEY nor FIRMS_MAP_KEY_{shard} is set")
    return key


def redact(text, key):
    return text.replace(key, "<key>") if key else text


def key_usage(key):
    """(used, limit) transactions in the key's current 10-minute window; this call is free.
    If the status endpoint is down, report an empty budget so the request is tried anyway."""
    try:
        with urlopen(f"{BASE}/mapserver/mapkey_status/?MAP_KEY={key}", timeout=60) as response:
            status = json.load(response)
    except (*NETWORK_ERRORS, ValueError):
        return 0, DEFAULT_LIMIT
    return status.get("current_transactions") or 0, status.get("transaction_limit") or DEFAULT_LIMIT


def wait_for_budget(key, need):
    """Block until the key has `need` transactions left. Workers sharing a key all wait here.
    The status call is free, so poll often: the window frees up gradually, not all at once."""
    used, limit = key_usage(key)
    if used + need > limit:
        print(f"  key at {used}/{limit} transactions, waiting", flush=True)
    while used + need > limit:
        time.sleep(POLL_SECONDS)
        used, limit = key_usage(key)


def get(path, key, need=0, attempts=8):
    """GET an API path and return the body, retrying with backoff. `need` is the request's
    transaction cost; when set, wait for that much budget first. Over the limit the API answers
    HTTP 400, so a 400 while the budget is nearly spent is a limit hit: retry right away (the
    budget wait does the waiting). 401/403/404 fail at once."""
    error: Exception | None = None
    for attempt in range(1, attempts + 1):
        if need:
            wait_for_budget(key, need)
        try:
            with urlopen(BASE + path, timeout=600) as response:
                return response.read()
        except HTTPError as exc:
            error = exc
            if exc.code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN, HTTPStatus.NOT_FOUND):
                break
            if exc.code == HTTPStatus.BAD_REQUEST and need:
                used, limit = key_usage(key)
                if used + need > limit:
                    continue
        except NETWORK_ERRORS as exc:
            error = exc
        if attempt < attempts:
            time.sleep(10 * attempt)
    raise RuntimeError(redact(f"{path}: {error}", key)) from None


def availability(key):
    """{data_id: (min_date, max_date)} for every API source, e.g. VIIRS_NOAA21_NRT."""
    rows = csv.DictReader(io.StringIO(get(f"/api/data_availability/csv/{key}/ALL", key).decode()))
    return {r["data_id"]: (date.fromisoformat(r["min_date"]), date.fromisoformat(r["max_date"])) for r in rows}


# --- Which days to fetch ----------------------------------------------------------------------

def days(first, last):
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def months(first, last):
    """(first of month, first day, last day) for each calendar month overlapping first..last."""
    m = date(first.year, first.month, 1)
    while m <= last:
        nxt = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
        yield m, max(m, first), min(nxt - timedelta(days=1), last)
        m = nxt


def best_kind(day, avail, prefix):
    """Where a day should come from now: SP once it exists, else NRT, else None (no data)."""
    for kind in ("SP", "NRT"):
        span = avail.get(f"{prefix}_{kind}")
        if span and span[0] <= day <= span[1]:
            return kind
    return None


def nrt_final_through(avail, prefix):
    """Last NRT day that is complete: the newest NRT day may still be filling in."""
    span = avail.get(f"{prefix}_NRT")
    return span[1] - timedelta(days=1) if span else None


def days_to_fetch(stored, final_through, lo, hi, avail, prefix):
    """Days in lo..hi that are missing, stored as NRT although SP exists now, or stored as NRT
    after the last NRT day that was complete when the file was written."""
    fetch = []
    for day in days(lo, hi):
        want, have = best_kind(day, avail, prefix), stored.get(day)
        stale_nrt = have == "NRT" and (final_through is None or day > final_through)
        if want and (have != want or stale_nrt):
            fetch.append(day)
    return fetch


def requests_for(fetch, avail, prefix):
    """(kind, first day, n days) API requests: runs of consecutive days with the same source,
    at most API_DAYS each."""
    requests = []
    for day in fetch:
        kind = best_kind(day, avail, prefix)
        if requests and requests[-1][0] == kind and requests[-1][2] < API_DAYS \
                and requests[-1][1] + timedelta(days=requests[-1][2]) == day:
            requests[-1] = (kind, requests[-1][1], requests[-1][2] + 1)
        else:
            requests.append((kind, day, 1))
    return requests


def build_plan(sensors, avail, start, end):
    """[(sensor, month, first day, last day)] for every sensor in order."""
    plan = []
    for sensor in sensors:
        prefix = SOURCES[sensor]
        sources = {k: v for k, v in avail.items() if k in (f"{prefix}_SP", f"{prefix}_NRT")}
        if not sources:
            sys.exit(f"the API lists no data for {prefix}")
        first = start or min(lo for lo, _ in sources.values())
        last = end or max(hi for _, hi in sources.values())
        sensor_months = list(months(first, last))
        plan += [(sensor, m, lo, hi) for m, lo, hi in sensor_months]
        listed = ', '.join(f'{k} {v[0]}..{v[1]}' for k, v in avail.items() if k.startswith(prefix + '_'))
        print(f"{sensor}: {first}..{last}, {len(sensor_months)} months; availability {listed}", flush=True)
    return plan


# --- What is stored already -------------------------------------------------------------------

def month_target(dest, sensor, month):
    return f"{dest}/sensor={sensor}/source=api/month={month:%Y-%m}/part.parquet"


def existing_months(con, dest):
    """{(sensor, 'YYYY-MM'): path} for month files already written."""
    paths = written(con, dest, "sensor=*/source=api/month=*/part.parquet")
    return {m.groups(): p for p in paths if (m := MONTH_FILE.search(p))}


def footers(con, paths):
    """{path: footer dict} for files written with the `days` footer (see month_footer)."""
    if not paths:
        return {}
    rows = con.execute("SELECT file_name, decode(value) FROM parquet_kv_metadata(?) WHERE decode(key) = 'days'",
                       [list(paths)]).fetchall()
    return {path: json.loads(value) for path, value in rows}


def stored_days(con, path, footer):
    """({day: 'SP'|'NRT'}, last complete NRT day) for one month file.

    Files written before the footer existed hold whole consecutive days. When their row-group
    statistics say every row is SP, the footer alone answers; otherwise the dates are scanned,
    and the newest NRT day is assumed to have been partial."""
    if footer:
        stored = {date.fromisoformat(d): kind for kind in ("SP", "NRT") for d in footer.get(kind, [])}
        through = footer.get("nrt_final_through")
        return stored, date.fromisoformat(through) if through else None
    stats = dict(con.execute("""
        SELECT path_in_schema, [min(stats_min_value), max(stats_max_value)] FROM parquet_metadata(?)
        WHERE path_in_schema IN ('acq_date', 'processing') GROUP BY 1""", [path]).fetchall())
    if stats.get("processing") == ["SP", "SP"]:
        first, last = (date.fromisoformat(v) for v in stats["acq_date"])
        return dict.fromkeys(days(first, last), "SP"), None
    rows = con.execute("SELECT acq_date, any_value(processing) FROM read_parquet(?) GROUP BY 1", [path]).fetchall()
    stored = dict(rows)
    nrt = [d for d, kind in stored.items() if kind == "NRT"]
    return stored, (max(nrt) - timedelta(days=1)) if nrt else None


def month_footer(stored, final_through):
    by_kind = {kind: sorted(d.isoformat() for d, k in stored.items() if k == kind) for kind in ("SP", "NRT")}
    return json.dumps({**by_kind, "nrt_final_through": final_through.isoformat() if final_through else None})


# --- One month --------------------------------------------------------------------------------

def save_month(con, target, stored, final_through):
    write_parquet(con, "SELECT * FROM month_rows", [], target, {"days": month_footer(stored, final_through)})


def extract_month(con, key, avail, target, sensor, fetch, stored, final_through, path):
    """Fetch `fetch` days, keep every other stored day, and write the month. Returns log text."""
    prefix, t0 = SOURCES[sensor], time.monotonic()
    keep = {d: k for d, k in stored.items() if d not in set(fetch)}
    con.execute("DROP TABLE IF EXISTS month_rows")
    if keep and path:  # copy into memory first: the file is about to be overwritten
        con.execute("CREATE TEMP TABLE month_rows AS SELECT * FROM read_parquet(?) WHERE list_contains(?, acq_date)",
                    [path, sorted(keep)])
    tmp, last_save, kinds = tempfile.mkdtemp(prefix="firms_api_"), time.monotonic(), set()
    try:
        for kind, day, n in requests_for(fetch, avail, prefix):
            source = f"{prefix}_{kind}"
            body = get(f"/api/area/csv/{key}/{source}/world/{n}/{day.isoformat()}", key, need=COST_PER_DAY * n)
            head = body[:120].decode("utf-8", "replace")
            if not head.startswith("latitude"):  # errors come back as text, sometimes with HTTP 200
                raise RuntimeError(f"{source} {day}: not CSV: {redact(head.strip(), key)[:100]}")
            if body.count(b"\n") > 1:  # more than the header
                csv_path = os.path.join(tmp, f"{source}_{day}.csv")
                with open(csv_path, "wb") as out:
                    out.write(body)
                add_rows(con, csv_path, sensor, kind, day, day + timedelta(days=n - 1),
                         has_type="type" in body.split(b"\n", 1)[0].decode().strip().split(","))
                kinds.add(kind)
            keep.update({day + timedelta(days=i): kind for i in range(n)})
            if time.monotonic() - last_save > CHECKPOINT_SECONDS and table_exists(con):
                save_month(con, target, keep, final_through)
                last_save = time.monotonic()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if not table_exists(con):
        return "no data"
    save_month(con, target, keep, final_through)
    rows = con.execute("SELECT count(*) FROM month_rows").fetchone()[0]
    return (f"{rows:,} rows ({'+'.join(sorted(kinds)) or 'kept'}), fetched {len(fetch)} of {len(keep)} days "
            f"in {time.monotonic() - t0:.0f}s")


def table_exists(con):
    return bool(con.execute("SELECT 1 FROM duckdb_tables() WHERE table_name = 'month_rows'").fetchall())


def add_rows(con, csv_path, sensor, kind, lo, hi, has_type):
    """Append one API response to month_rows. API files drop acq_time's leading zeros (the lpad
    in columns() fixes it); NRT files have no `type`, so it is NULL for them."""
    select = f"""
        SELECT {columns(sensor, has_type)}, '{kind}' AS processing
        FROM read_csv(?, header = true, all_varchar = true)
        WHERE CAST(acq_date AS DATE) BETWEEN DATE '{lo}' AND DATE '{hi}'
    """
    if table_exists(con):
        con.execute(f"INSERT INTO month_rows BY NAME {select}", [csv_path])
    else:
        con.execute(f"CREATE TEMP TABLE month_rows AS {select}", [csv_path])


# --- Main -------------------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dest", required=True, help="local folder or r2://bucket/prefix")
    parser.add_argument("--sensors", "--sensor", required=True,
                        help=f"comma-separated, from {','.join(sorted(SOURCES))}")
    parser.add_argument("--start", type=date.fromisoformat, help="first day (default: first day the API has)")
    parser.add_argument("--end", type=date.fromisoformat, help="last day (default: last day the API has)")
    parser.add_argument("--refresh", type=int, help=argparse.SUPPRESS)  # old flag; changed days are found now
    parser.add_argument("--shard", default="1/1", help="K/N: only this worker's sensor-months (round-robin)")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--memory", default="2GB")
    args = parser.parse_args()
    args.dest = args.dest.rstrip("/")
    args.sensors = args.sensors.split(",")
    unknown = set(args.sensors) - set(SOURCES)
    if unknown:
        parser.error(f"unknown sensors: {', '.join(sorted(unknown))}")
    args.shard = parse_shard(parser, args.shard)
    return args


def main():
    args = parse_args()
    shard, shards = args.shard
    key = map_key(shard)
    avail = availability(key)

    plan = build_plan(args.sensors, avail, args.start, args.end)[shard - 1::shards]
    print(f"shard {shard}/{shards}: {len(plan)} sensor-months", flush=True)

    con = connect(args.dest, args.threads, args.memory)
    existing = existing_months(con, args.dest)
    footer = footers(con, [existing[sensor, f"{m:%Y-%m}"] for sensor, m, _, _ in plan
                           if (sensor, f"{m:%Y-%m}") in existing])
    failed = 0
    for i, (sensor, month, lo, hi) in enumerate(plan, 1):
        label = f"[{i}/{len(plan)}] {sensor} {month:%Y-%m}"
        try:
            path = existing.get((sensor, f"{month:%Y-%m}"))
            stored, stored_through = stored_days(con, path, footer.get(path)) if path else ({}, None)
            fetch = days_to_fetch(stored, stored_through, lo, hi, avail, SOURCES[sensor])
            if path and not fetch:
                print(f"{label}: exists, skipped", flush=True)
                continue
            target = month_target(args.dest, sensor, month)
            final_through = nrt_final_through(avail, SOURCES[sensor])
            result = extract_month(con, key, avail, target, sensor, fetch, stored, final_through, path)
            print(f"{label}: {result}", flush=True)
        except JOB_ERRORS as exc:  # keep going; a rerun retries the month
            failed += 1
            print(f"{label}: FAILED {redact(str(exc), key)[:300]}", file=sys.stderr, flush=True)
    print(f"done at {datetime.now(UTC):%Y-%m-%dT%H:%MZ}: {len(plan)} sensor-months, {failed} failed",
          flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
