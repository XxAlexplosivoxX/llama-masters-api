"""Pieces shared by the processing stages: the DuckDB connection (R2 secret, spatial) and paths.

The bucket root holds one folder per layer: raw/ (written by 1-extract_data), clean/,
aggregates/, harmonized/, exports/, reference/ (boundaries, cell masks) and staging/ (API rows
split by country, written by prepare.py).
"""
import os
import sys

import duckdb
import numpy as np
import shapely

SENSORS = {  # sensor folder -> label used in outputs
    "modis": "MODIS",
    "viirs-snpp": "S-NPP",
    "viirs-jpss1": "NOAA-20",
    "viirs-jpss2": "NOAA-21",
}
BOUNDARIES = "reference/boundaries/adm1.parquet"
CELL_STATES = "reference/cell_states.parquet"
COUNTRIES = "reference/countries.parquet"
COUNTRY_CELLS = "reference/country_cells.parquet"
FINGERPRINT = "reference/fingerprint.parquet"
STATIC_CELLS_FILE = "reference/static_cells.parquet"
MASK_CELLS = 10  # country cells: 1/0.1°
STATIC_CELLS = {"modis": 100, "viirs": 200}  # static-source cells: 1/0.01° and 1/0.005°


def family(sensor: str) -> str:
    return "modis" if sensor == "modis" else "viirs"


def cell(column: str, per_degree: int) -> str:
    return f"CAST(floor({column} * {per_degree}) AS INTEGER)"


def outlines(geoms: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Every polygon ring and line inside `geoms`, and the index of the geometry each belongs to.
    Unpacks nested parts fully: ST_MakeValid can return a collection holding a MultiPolygon, and
    shapely.get_parts opens only one level."""
    parts, index = shapely.get_parts(geoms, return_index=True)
    while (nested := np.isin(shapely.get_type_id(parts), (4, 5, 6, 7))).any():  # multi-* and collections
        inner, inner_of = shapely.get_parts(parts[nested], return_index=True)
        parts = np.concatenate([parts[~nested], inner])
        index = np.concatenate([index[~nested], index[nested][inner_of]])
    kind = shapely.get_type_id(parts)
    polygon, line = kind == 3, (kind == 1) | (kind == 2)
    rings, ring_of = shapely.get_rings(parts[polygon], return_index=True)
    return np.concatenate([rings, parts[line]]), np.concatenate([index[polygon][ring_of], index[line]])


def is_remote(path: str) -> bool:
    return path.startswith(("r2://", "s3://"))


def connect(root: str, threads: int, memory: str) -> duckdb.DuckDBPyConnection:
    """DuckDB with httpfs and spatial, plus the R2 secret when root is on R2."""
    con = duckdb.connect()
    con.execute(f"SET threads = {threads}; SET memory_limit = '{memory}'; SET preserve_insertion_order = false;")
    con.execute("SET temp_directory = '.duckdb_tmp'; SET http_retries = 5; SET http_timeout = 300000;")
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    if root.startswith("r2://"):
        names = ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ACCOUNT_ID")
        missing = [n for n in names if not os.environ.get(n)]
        if missing:
            sys.exit(f"missing environment variables for R2: {', '.join(missing)}")
        con.execute("CREATE SECRET r2 (TYPE r2, KEY_ID ?, SECRET ?, ACCOUNT_ID ?)", [os.environ[n] for n in names])
    return con


def one(con: duckdb.DuckDBPyConnection, query: str) -> tuple:
    """The single row of an aggregate query."""
    row = con.execute(query).fetchone()
    if row is None:
        raise RuntimeError(f"query returned no row: {query[:80]}")
    return row


def arrays(con: duckdb.DuckDBPyConnection, query: str) -> dict[str, np.ndarray]:
    """A query's columns as numpy arrays."""
    return {name: np.asarray(column) for name, column in con.execute(query).fetchnumpy().items()}


def files(con: duckdb.DuckDBPyConnection, pattern: str) -> list[str]:
    """Files matching a glob pattern, locally or on R2."""
    return [row[0] for row in con.execute("SELECT file FROM glob(?)", [pattern]).fetchall()]


def exists(con: duckdb.DuckDBPyConnection, path: str) -> bool:
    """Whether a file exists. On R2, glob() returns a path without wildcards as-is, even when it is
    missing, so list its folder instead."""
    return path in files(con, f"{os.path.dirname(path)}/*")


def write_parquet(con: duckdb.DuckDBPyConnection, query: str, target: str, order: str = "") -> None:
    """COPY a query to one Parquet file (zstd). Locally via .tmp + rename, so a crash leaves no partial file."""
    local = not is_remote(target)
    out = f"{target}.tmp" if local else target
    if local:
        os.makedirs(os.path.dirname(target), exist_ok=True)
    order_by = f" ORDER BY {order}" if order else ""
    con.execute(f"COPY ({query}{order_by}) TO '{out}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 100000)")
    if local:
        os.replace(out, target)
