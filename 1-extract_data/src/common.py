"""Pieces shared by the extraction scripts: the typed column projection, the DuckDB connection
(with the R2 secret), the "already written?" check, the Parquet writer, and --shard parsing."""
import argparse
import glob
import os
import sys

import duckdb

BASE = "https://firms.modaps.eosdis.nasa.gov"
# Failures that skip one file or month and let the run go on (a rerun retries it): DuckDB
# (queries, R2/NASA reads), network and files, bad responses, our own RuntimeErrors.
# Anything else is a bug and stops the run.
JOB_ERRORS = (duckdb.Error, OSError, ValueError, RuntimeError)

# Typed projection. Everything is read as text first (all_varchar), because NASA's
# files are not always typed the same way across years.
COMMON = """
    CAST(latitude AS DOUBLE)            AS latitude,
    CAST(longitude AS DOUBLE)           AS longitude,
    CAST(acq_date AS DATE)              AS acq_date,
    lpad(acq_time, 4, '0')              AS acq_time,
    satellite,
    instrument,
    confidence,
    version,
    CAST(scan AS FLOAT)                 AS scan,
    CAST(track AS FLOAT)                AS track,
    CAST(frp AS FLOAT)                  AS frp,
    daynight,
    {type}                              AS type,
"""
BRIGHTNESS = {
    "modis": "CAST(brightness AS FLOAT) AS brightness, CAST(bright_t31 AS FLOAT) AS bright_t31",
    "viirs": "CAST(bright_ti4 AS FLOAT) AS bright_ti4, CAST(bright_ti5 AS FLOAT) AS bright_ti5",
}


def is_remote(path):
    return path.startswith(("r2://", "s3://"))


def columns(sensor, has_type=True):
    """SELECT list with NASA's columns typed. Without a `type` column, `type` is NULL."""
    family = "modis" if sensor == "modis" else "viirs"
    type_expr = "TRY_CAST(type AS TINYINT)" if has_type else "CAST(NULL AS TINYINT)"
    return COMMON.format(type=type_expr) + " " + BRIGHTNESS[family]


def connect(dest, threads, memory):
    """DuckDB with httpfs, plus the R2 secret when dest is on R2."""
    con = duckdb.connect()
    con.execute(f"SET threads = {threads}; SET memory_limit = '{memory}'; SET preserve_insertion_order = false;")
    con.execute("SET temp_directory = '.duckdb_tmp'; SET http_retries = 5; SET http_timeout = 300000;")
    con.execute("INSTALL httpfs; LOAD httpfs;")
    if dest.startswith("r2://"):
        names = ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ACCOUNT_ID")
        missing = [n for n in names if not os.environ.get(n)]
        if missing:
            sys.exit(f"missing environment variables for R2: {', '.join(missing)}")
        con.execute("CREATE SECRET r2 (TYPE r2, KEY_ID ?, SECRET ?, ACCOUNT_ID ?)", [os.environ[n] for n in names])
    return con


def written(con, dest, pattern):
    """Files under dest matching a glob pattern, locally or on R2, so reruns can skip them."""
    if is_remote(dest):
        return [row[0] for row in con.execute("SELECT file FROM glob(?)", [f"{dest}/{pattern}"]).fetchall()]
    return glob.glob(f"{glob.escape(dest)}/{pattern}")


def write_parquet(con, query, params, target, metadata=None):
    """COPY `query`, sorted by date and place, to a Parquet file at `target`. `metadata` is an
    optional {key: text} stored in the file footer (read back with parquet_kv_metadata).

    Locally the file is written as .tmp and renamed when complete, so a crash never leaves a
    partial part.parquet that a rerun would skip. R2 objects only appear once fully uploaded."""
    local = not is_remote(target)
    out = f"{target}.tmp" if local else target
    if local:
        os.makedirs(os.path.dirname(target), exist_ok=True)
    kv = "".join(f", KV_METADATA {{{k}: $${v}$$}}" for k, v in (metadata or {}).items())
    con.execute(f"""
        COPY ({query} ORDER BY acq_date, latitude, longitude)
        TO '{out}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 100000{kv})
    """, params)
    if local:
        os.replace(out, target)


def parse_shard(parser: argparse.ArgumentParser, text: str) -> tuple[int, int]:
    """'K/N' -> (K, N), or a usage error."""
    usage = f"--shard must look like K/N with 1 <= K <= N, got {text}"
    try:
        shard, shards = (int(v) for v in text.split("/"))
    except ValueError:
        parser.error(usage)
    if not 1 <= shard <= shards:
        parser.error(usage)
    return shard, shards
