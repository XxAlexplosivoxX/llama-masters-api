"""Harmonized monthly record and the API files: aggregates/ -> exports/ (plan §4-§6).

Run once, after every worker has run aggregate.py. Writes what 3-api_atlas serves:

    <root>/exports/places.json
    <root>/exports/<id>/meta.json            sensors, coefficients, scores, caveats
    <root>/exports/<id>/monthly.json         per area (country, states): raw series per sensor, the
                                             harmonized record with p10-p90, baseline, scores
    <root>/exports/<id>/monthly_grid.json    raw MODIS and the harmonized record per grid cell
    <root>/exports/<id>/recent_hotspots.json the world's last 7 days of points in the country
    <root>/exports/<id>/outline.json         the country outline (its states merged), for the map

Method (0-plans/HARMONIZATION_PLAN.md), on the NOAA-20 scale, per country:

  1. Each month takes the first VIIRS satellite that covers it fully: NOAA-20 (x1), NOAA-21
     (x f21), S-NPP (x fNPP). Satellites are never summed. These months are "observed".
  2. Months without one (2000-11 -> 2012-01) are "reconstructed" from MODIS (Terra + Aqua):
         VIIRS_eq(c, t) = R_c x F_m x fNPP x MODIS(c, t)
     R_c is the 0.5° cell's S-NPP/MODIS ratio of sums, shrunk toward the country's ratio with
     k = 200 MODIS detections; F_m the country's calendar-month factor. Terra-only months (before
     Aqua) first take their calendar month's (Terra + Aqua)/Terra factor.
  3. Leave-one-year-out over the S-NPP years scores, per area (country and each state), the cell
     model against the area's own ratio x F_m and a fixed ratio. An area where the cell model
     loses uses ratio x F_m. The p10-p90 band of a reconstructed month comes from the held-out
     error ratios (real / predicted).
  4. fNPP, f21, the Terra factor and the country ratio are the country's ratios of sums, shrunk
     toward the world's (k = 1000 and 200), so countries with few detections borrow from the world.

  python 2-process_data/src/export.py --root r2://llama-masters-firms
  python 2-process_data/src/export.py --root r2://llama-masters-firms --country Venezuela
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed

import duckdb
import numpy as np
import shapely

sys.path.insert(0, os.path.dirname(__file__))
from common import BOUNDARIES, connect, is_remote

SATS = ("Terra", "Aqua", "S-NPP", "NOAA-20", "NOAA-21")
TERRA, AQUA, NPP, N20, N21 = range(len(SATS))
CHAIN = (N20, N21, NPP)  # VIIRS satellites in order of preference
K_CELL = 200  # MODIS detections pulling a cell's (or state's) ratio toward the country's (plan §4.2)
K_WORLD = 1000  # detections pulling a country's factors toward the world's
FIT_STEP = 5  # fitting cells in 0.1° units: 0.5°
GRID_STEPS = (1, 2, 5, 10, 20)  # display cells in 0.1° units: the finest one under GRID_BUDGET
GRID_BUDGET = 1_500_000  # nonzero (cell, month) values per grid file, both series together
GRID_EQ_SCALE = 10  # the record is kept to 0.1 detection: stored as integer tenths
RECENT_DAYS = 7
OUTLINE_SNAP = 0.01  # degrees: states snap to one grid first, so shared borders vanish in the union
BASELINE_YEARS = (2003, 2025)
MIN_BAND_MONTHS = 24  # held-out months an area needs for its own band (else the country's)
METHOD = ("Real VIIRS on the NOAA-20 scale wherever a VIIRS satellite covers the month (NOAA-20, else "
          "NOAA-21 x f21, else S-NPP x fNPP); before that, MODIS converted per 0.5° cell and calendar month "
          "(R_c x F_m x fNPP), fitted on S-NPP vs Terra + Aqua.")
SOURCES = [
    ("NASA FIRMS MODIS C6.1 (Terra, Aqua) and VIIRS 375 m (S-NPP, NOAA-20, NOAA-21): archive (SP) "
     "and near-real-time API"),
    "geoBoundaries CGAZ ADM1 (states)",
]
LIMITATIONS = [
    "Hotspot counts, not burned area: one fire can give many detections, and clouds hide fires.",
    ("Static sources (gas flares, volcanoes, industry) are removed by FIRMS type, or for near-real-time "
     "rows by the cells where the archive marks them."),
    ("Reconstructed months (before VIIRS) are estimates; their p10-p90 band is the spread of the "
     "held-out errors. Terra-only months (before July 2002) are less certain still."),
    "The conversion is fitted on 0.5° cells: areas drawn smaller than that inherit their cell's ratio.",
    "Near-real-time (provisional) rows are replaced when the archive catches up.",
]


# --- Calendar and coverage ------------------------------------------------------------------------

def month_add(day: dt.date, months: int) -> dt.date:
    k = day.year * 12 + day.month - 1 + months
    return dt.date(k // 12, k % 12 + 1, 1)


class Calendar:
    """The months of the record and which satellite covers each one (world-wide, from the reports)."""

    def __init__(self, spans: dict[int, tuple]) -> None:  # sat -> (first_day, last_day, provisional_from)
        self.last_day = max(s[1] for s in spans.values())
        first = min(s[0] for s in spans.values())
        self.start = dt.date(first.year, first.month, 1)
        self.months = (self.last_day.year - first.year) * 12 + self.last_day.month - first.month + 1
        T = self.months
        starts = [month_add(self.start, t) for t in range(T)]
        ends = [month_add(self.start, t + 1) - dt.timedelta(days=1) for t in range(T)]
        self.label = [s.strftime("%Y-%m") for s in starts]
        self.year = np.array([s.year for s in starts])
        self.cal = np.array([s.month - 1 for s in starts])
        self.final = np.arange(T) == T - 1  # the month in progress
        self.full = np.zeros((len(SATS), T), bool)  # covers every day (the final month: up to the last day)
        self.any = np.zeros((len(SATS), T), bool)
        self.prov = np.zeros((len(SATS), T), bool)  # near-real-time rows in the month
        for s, (a, b, p) in spans.items():
            last_ok = b >= self.last_day - dt.timedelta(days=1)
            self.full[s] = [a <= st and (b >= en or (f and last_ok)) for st, en, f in zip(starts, ends, self.final)]
            self.any[s] = [a <= en and b >= st for st, en in zip(starts, ends)]
            self.prov[s] = [p is not None and en >= p for en in ends]
        self.viirs = np.full(T, -1)  # VIIRS satellite of each observed month
        for s in reversed(CHAIN):
            self.viirs[self.full[s]] = s
        modis_any = self.any[TERRA] | self.any[AQUA]
        self.source = np.where(self.viirs >= 0, "observed", np.where(modis_any, "reconstructed", ""))
        self.terra_only = self.any[TERRA] & ~self.any[AQUA]
        modis_full = self.full[TERRA] | self.full[AQUA]
        self.partial = self.final | ((self.source == "reconstructed") & ~modis_full)
        self.provisional = np.where(self.viirs >= 0, self.prov[np.maximum(self.viirs, 0), np.arange(T)],
                                    self.prov[TERRA] | self.prov[AQUA])
        settled = ~self.final
        # conversion fit: S-NPP and both MODIS satellites complete, archive rows only
        self.train = (self.full[NPP] & self.full[TERRA] & self.full[AQUA] & settled
                      & ~self.prov[NPP] & ~self.prov[TERRA] & ~self.prov[AQUA])
        self.npp_pairs = self.full[N20] & self.full[NPP] & settled
        self.n21_pairs = self.full[N20] & self.full[N21] & settled
        self.terra_pairs = self.full[TERRA] & self.full[AQUA] & settled & ~self.prov[TERRA] & ~self.prov[AQUA]


def shrink(num: float, den: float, prior: float, k: float) -> float:
    """Ratio of sums num/den pulled toward `prior` by k pseudo-detections of the denominator."""
    return float((num + k * prior) / (den + k))


def plain(num: float, den: float) -> float:
    return float(num / den) if den > 0 else 1.0


class Factors:
    """Scale factors between satellites, from monthly totals (5 x T)."""

    def __init__(self, tot: np.ndarray, cal: Calendar, world: "Factors | None" = None) -> None:
        c = cal
        modis = tot[TERRA] + tot[AQUA]

        def ratio(num, den, prior):
            return plain(num, den) if world is None else shrink(num, den, prior, K_WORLD)

        self.f_npp = ratio(tot[N20, c.npp_pairs].sum(), tot[NPP, c.npp_pairs].sum(), world and world.f_npp)
        self.f21 = ratio(tot[N20, c.n21_pairs].sum(), tot[N21, c.n21_pairs].sum(), world and world.f21)
        self.terra = np.array([ratio(modis[c.terra_pairs & (c.cal == m)].sum(), tot[TERRA, c.terra_pairs & (c.cal == m)].sum(),
                                     world and world.terra[m]) for m in range(12)])
        self.r0 = ratio(tot[NPP, c.train].sum(), modis[c.train].sum(), world and world.r0)  # S-NPP per MODIS
        self.pairs = {"f_npp": int(c.npp_pairs.sum()), "f21": int(c.n21_pairs.sum()), "terra": int(c.terra_pairs.sum())}

    def viirs_factor(self, cal: Calendar) -> np.ndarray:
        f = {N20: 1.0, N21: self.f21, NPP: self.f_npp}
        return np.array([f.get(int(s), np.nan) for s in cal.viirs])


# --- One country --------------------------------------------------------------------------------

def group(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Distinct (a, b) pairs and each row's pair index. One int64 key: much faster than unique(axis=0)."""
    a0, b0 = (a.min(), b.min()) if len(a) else (0, 0)
    span = int(b.max() - b0 + 1) if len(b) else 1
    keys, inv = np.unique((a - a0).astype(np.int64) * span + (b - b0), return_inverse=True)
    return np.stack([keys // span + a0, keys % span + b0], 1), inv.ravel()


class Country:
    """A country's counts per satellite x fitting piece (0.5° cell x state) x month."""

    def __init__(self, con: duckdb.DuckDBPyConnection, root: str, name: str, cal: Calendar) -> None:
        path = f"{root}/aggregates/country={name}/cells.parquet"
        self.state_ids = [r[0] for r in con.execute(
            f"SELECT DISTINCT state_id FROM read_parquet('{path}') WHERE state_id IS NOT NULL ORDER BY 1").fetchall()]
        d = con.execute(f"""
            SELECT CAST(list_position(?, satellite) - 1 AS TINYINT) AS sat, x, y,
                   CAST(coalesce(list_position(?, state_id), 0) - 1 AS INTEGER) AS st,
                   CAST(datediff('month', CAST(? AS DATE), month) AS INTEGER) AS t, n,
                   coalesce(bt_sum, 0) AS bt_sum, coalesce(bt_n, 0) AS bt_n
            FROM read_parquet('{path}') WHERE satellite IN ({", ".join(f"'{s}'" for s in SATS)})""",
                        [list(SATS), self.state_ids, cal.start]).fetchnumpy()
        self.sat, self.x, self.y, self.st, self.t = (np.asarray(d[k]).astype(np.int64) for k in ("sat", "x", "y", "st", "t"))
        self.n = np.asarray(d["n"]).astype(np.float64)
        self.bt_sum = np.asarray(d["bt_sum"]).astype(np.float64)  # brightness temperature, K: sum and count
        self.bt_n = np.asarray(d["bt_n"]).astype(np.float64)
        keep = (self.t >= 0) & (self.t < cal.months)
        for k in ("sat", "x", "y", "st", "t", "n", "bt_sum", "bt_n"):
            setattr(self, k, getattr(self, k)[keep])
        T, S = cal.months, len(self.state_ids)
        c5_keys, self.c5 = group(self.x // FIT_STEP, self.y // FIT_STEP)
        self.n_c5 = len(c5_keys)
        pieces, self.piece = group(self.c5, self.st)
        P = len(pieces)
        self.piece_c5, piece_st = pieces[:, 0], pieces[:, 1]
        self.counts = np.bincount((self.sat * P + self.piece) * T + self.t, self.n,
                                  minlength=len(SATS) * P * T).reshape(len(SATS), P, T)
        self.ind = np.zeros((S, P))  # state x piece membership
        has = piece_st >= 0
        self.ind[piece_st[has], np.arange(P)[has]] = 1.0
        self.total = self.counts.sum(1)  # sat x T

    def areas(self, mat: np.ndarray) -> np.ndarray:
        """Per-area sums of a piece x month matrix: row 0 the country, then each state."""
        return np.vstack([mat.sum(0, keepdims=True), self.ind @ mat])


def fit(c: Country, M: np.ndarray, V: np.ndarray, train: np.ndarray, cal: Calendar, r0_prior: float):
    """Cell ratios R (per 0.5° cell), country ratio R0 and calendar-month factors F, on S-NPP scale."""
    sm = np.bincount(c.piece_c5, M[:, train].sum(1), c.n_c5)
    sv = np.bincount(c.piece_c5, V[:, train].sum(1), c.n_c5)
    r0 = shrink(sv.sum(), sm.sum(), r0_prior, K_CELL)
    R = (sv + K_CELL * r0) / (sm + K_CELL)
    pred = (R[c.piece_c5][:, None] * M[:, train]).sum(0)
    real = V[:, train].sum(0)
    month = cal.cal[train]
    F = np.array([(real[month == m].sum() + K_CELL) / (pred[month == m].sum() + K_CELL) for m in range(12)])
    return r0, R, F


def wape(pred: np.ndarray, real: np.ndarray) -> float | None:
    return float(np.abs(pred - real).sum() / real.sum()) if real.sum() > 0 else None


def spearman(a: np.ndarray, b: np.ndarray) -> float | None:
    if len(a) < 3 or np.ptp(a) == 0 or np.ptp(b) == 0:
        return None
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def validate(c: Country, M, V, MA, VA, cal: Calendar, r0_prior: float) -> list[dict]:
    """Leave-one-year-out per area: scores of each model, the chosen one, and its band."""
    years = np.unique(cal.year[cal.train])
    A = MA.shape[0]
    held = {k: [] for k in ("real", "cell", "ratio_fm", "fixed")}
    held_year = []
    for year in years if len(years) >= 2 else []:
        tr, te = cal.train & (cal.year != year), cal.train & (cal.year == year)
        r0, R, F = fit(c, M, V, tr, cal, r0_prior)
        r0a = np.array([shrink(v, m, r0, K_CELL) for v, m in zip(VA[:, tr].sum(1), MA[:, tr].sum(1))])
        f = F[cal.cal[te]]
        held["real"].append(VA[:, te])
        held["cell"].append(c.areas(R[c.piece_c5][:, None] * M[:, te]) * f)
        held["ratio_fm"].append(r0a[:, None] * MA[:, te] * f)
        held["fixed"].append(r0a[:, None] * MA[:, te])
        held_year.append(np.full(te.sum(), year))
    if not held_year:
        return [{"model": "cell", "test_months": 0} for _ in range(A)]
    h = {k: np.hstack(v) for k, v in held.items()}
    hy = np.concatenate(held_year)
    out = []
    for a in range(A):
        real = h["real"][a]
        w = {k: wape(h[k][a], real) for k in ("cell", "ratio_fm", "fixed")}
        model = "ratio_fm" if w["cell"] is not None and w["ratio_fm"] is not None and w["ratio_fm"] < w["cell"] else "cell"
        pred = h[model][a]
        ok = pred > 0
        ratios, ry = real[ok] / pred[ok], hy[ok]
        band = np.quantile(ratios, [0.1, 0.9]) if ok.sum() >= MIN_BAND_MONTHS else None
        inside = []
        for year in years:  # coverage: each held-out year against the band of the other years
            other = ratios[ry != year]
            if len(other) >= MIN_BAND_MONTHS and (ry == year).any():
                lo, hi = np.quantile(other, [0.1, 0.9])
                r = ratios[ry == year]
                inside.append((r >= lo) & (r <= hi))
        ann_p = np.array([pred[hy == y].sum() for y in years])
        ann_r = np.array([real[hy == y].sum() for y in years])
        out.append({
            "model": model, "test_months": int(len(real)),
            "wape": {k: num(v, 4) for k, v in w.items()},
            "bias": num(pred.sum() / real.sum() - 1, 4) if real.sum() > 0 else None,
            "year_rank_spearman": num(spearman(ann_p, ann_r), 3),
            "band": [num(band[0], 3), num(band[1], 3)] if band is not None else None,
            "band_coverage": num(np.concatenate(inside).mean(), 3) if inside else None,
        })
    return out


def num(v, digits: int):
    """A JSON number (None for NaN/None)."""
    if v is None:
        return None
    v = float(v)
    return None if not np.isfinite(v) else round(v, digits)


def series(values: np.ndarray, digits: int) -> list:
    out = np.round(values.astype(np.float64), digits).tolist()
    return [None if v != v else (int(v) if digits == 0 else v) for v in out]


def baseline(values: np.ndarray, cal: Calendar) -> dict:
    """Median, mean, p25, p75 per calendar month over BASELINE_YEARS (complete months only)."""
    ok = (cal.year >= BASELINE_YEARS[0]) & (cal.year <= BASELINE_YEARS[1]) & ~cal.partial & ~np.isnan(values)
    stats = {k: [] for k in ("median", "mean", "p25", "p75")}
    for m in range(12):
        v = values[ok & (cal.cal == m)]
        q = np.quantile(v, [0.5, 0.25, 0.75]) if len(v) else [np.nan] * 3
        for k, x in zip(stats, (q[0], v.mean() if len(v) else np.nan, q[1], q[2])):
            stats[k].append(num(x, 1))
    return {"years": list(BASELINE_YEARS), **stats}


def grid_cells(c: Country, cal: Calendar, R: np.ndarray, modis_factor: np.ndarray, viirs_factor: np.ndarray):
    """Raw MODIS, the harmonized record and mean brightness temperatures per display cell, coarsened
    until it fits GRID_BUDGET."""
    modis = (c.sat == TERRA) | (c.sat == AQUA)
    recon = modis & (cal.source[c.t] == "reconstructed")
    observed = (cal.viirs[c.t] >= 0) & (c.sat == cal.viirs[c.t])
    eq = np.where(recon, R[c.c5] * modis_factor[c.t] * c.n, 0.0) + np.where(observed, viirs_factor[c.t] * c.n, 0.0)
    raw = np.where(modis, c.n, 0.0)
    T = cal.months

    def at(step: int):
        """Cells of `step` tenths of a degree: keys, raw MODIS and harmonized per cell x month, values."""
        keys, inv = group(c.x // step, c.y // step)
        lin = inv * T + c.t
        mod = np.bincount(lin, raw, len(keys) * T).reshape(-1, T)
        har = np.round(np.bincount(lin, eq, len(keys) * T).reshape(-1, T), 1)
        return step, keys, inv, mod, har, int((mod > 0).sum() + (har > 0).sum())

    # the finest step under the budget (lazy: coarser steps are only computed when needed), else the coarsest
    step, keys, inv, mod, har, size = next((g for g in map(at, GRID_STEPS) if g[5] <= GRID_BUDGET), None) or at(GRID_STEPS[-1])

    def mean_bt(rows: np.ndarray) -> np.ndarray:
        """Mean brightness temperature (K) per cell x month of the given rows; 0 where none."""
        lin = inv[rows] * T + c.t[rows]
        # float64 even with no rows (bincount of an empty array is integer)
        total = np.bincount(lin, c.bt_sum[rows], len(keys) * T).reshape(-1, T).astype(np.float64)
        count = np.bincount(lin, c.bt_n[rows], len(keys) * T).reshape(-1, T).astype(np.float64)
        return np.divide(total, count, out=np.zeros_like(total), where=count > 0)

    modis_bt, viirs_bt = mean_bt(modis), mean_bt(~modis)
    keep = (mod > 0).any(1) | (har > 0).any(1) | (viirs_bt > 0).any(1)
    keys, mod, har, modis_bt, viirs_bt = keys[keep], mod[keep], har[keep], modis_bt[keep], viirs_bt[keep]
    grid = {
        "cells": {"west": np.round(keys[:, 0] * step / 10, 1).tolist(), "south": np.round(keys[:, 1] * step / 10, 1).tolist()},
        "modis": sparse_columns(mod, 1),
        "viirs_eq": sparse_columns(har, GRID_EQ_SCALE),
        # brightness temperature (K, whole degrees): MODIS on the MODIS positions above (0 = none);
        # VIIRS (every VIIRS satellite) with its own positions, since they differ from viirs_eq's
        "modis_bt": np.round(modis_bt[np.nonzero(mod)]).astype(np.int64).tolist(),
        "viirs_bt": sparse_columns(viirs_bt, 1),
    }
    return step / 10, grid, size


def sparse_columns(values: np.ndarray, scale: int) -> dict:
    """Nonzero months of a cells x months matrix, as three flat columns (grid version 5):
    count per cell; gap = month index minus the previous nonzero month of the same cell (the first
    is the month itself); value x scale as an integer. Small integers compress far better than pairs."""
    row, t = np.nonzero(values)  # row-major: grouped by cell, months ascending
    gap = np.diff(t, prepend=0)
    first = np.r_[True, row[1:] != row[:-1]] if len(row) else np.zeros(0, bool)
    gap[first] = t[first]
    return {"scale": scale, "count": np.bincount(row, minlength=len(values)).tolist(), "gap": gap.tolist(),
            "value": np.round(values[row, t] * scale).astype(np.int64).tolist()}


def country_outline(state_ids: list[str], shapes: dict) -> dict | None:
    """The country's outline for the map: its states snapped to one grid (so the borders between
    them cancel out), merged, and simplified in proportion to the country's size."""
    parts = [shapes[s] for s in state_ids if s in shapes]
    if not parts:
        return None
    merged = shapely.union_all(shapely.set_precision(np.array(parts, dtype=object), OUTLINE_SNAP))
    x0, y0, x1, y1 = merged.bounds
    tol = float(np.clip(np.hypot(x1 - x0, y1 - y0) / 800, OUTLINE_SNAP, 0.05))
    merged = merged.simplify(tol, preserve_topology=True)
    polys = [g for g in shapely.get_parts(merged) if g.area >= (2 * tol) ** 2]  # drop specks of islands
    if not polys:
        return None
    return json.loads(shapely.to_geojson(shapely.set_precision(shapely.MultiPolygon(polys), 0.001)))


def export_country(con, root: str, name: str, cal: Calendar, world: Factors, tot: np.ndarray,
                   info: dict, states: dict, shapes: dict, generated: str) -> dict:
    t0 = time.monotonic()
    pid, label = slug(name), name.replace("_", " ")  # FIRMS names use underscores
    hashes: list[str] = []  # of the five files written, for the places.json version
    c = Country(con, root, name, cal)
    fac = Factors(tot, cal, world)
    M = c.counts[TERRA] + c.counts[AQUA]
    V = c.counts[NPP]
    MA, VA = c.areas(M), c.areas(V)
    scores = validate(c, M, V, MA, VA, cal, world.r0)
    r0, R, F = fit(c, M, V, cal.train, cal, world.r0)
    r0a = np.array([shrink(v, m, r0, K_CELL) for v, m in zip(VA[:, cal.train].sum(1), MA[:, cal.train].sum(1))])
    # NOAA-20 scale: MODIS -> S-NPP (R, F) -> NOAA-20 (fNPP); Terra-only months first to Terra + Aqua
    modis_factor = F[cal.cal] * fac.f_npp * np.where(cal.terra_only, fac.terra[cal.cal], 1.0)
    viirs_factor = fac.viirs_factor(cal)
    if scores[0]["model"] == "ratio_fm":  # the country itself falls back: one ratio for every cell
        R = np.full_like(R, r0)
    cell_recon = c.areas(R[c.piece_c5][:, None] * M) * modis_factor
    ratio_recon = r0a[:, None] * MA * modis_factor
    use_ratio = np.array([s["model"] == "ratio_fm" for s in scores])
    recon = np.where(use_ratio[:, None], ratio_recon, cell_recon)
    sat_areas = np.stack([c.areas(c.counts[s]) for s in range(len(SATS))])  # sat x area x T
    observed = sat_areas[np.maximum(cal.viirs, 0), :, np.arange(cal.months)].T * viirs_factor
    record = np.where(cal.source == "observed", observed, np.where(cal.source == "reconstructed", recon, np.nan))
    is_recon = cal.source == "reconstructed"
    country_band = scores[0].get("band")

    names = [label] + [states.get(s, s) for s in c.state_ids]
    ids = ["country"] + c.state_ids
    areas = []
    for a in range(len(ids)):
        band = scores[a].get("band") or country_band
        lo = np.where(is_recon, record[a] * band[0], np.nan) if band else np.full(cal.months, np.nan)
        hi = np.where(is_recon, record[a] * band[1], np.nan) if band else np.full(cal.months, np.nan)
        raw = {"MODIS": np.where(cal.any[TERRA] | cal.any[AQUA], sat_areas[TERRA, a] + sat_areas[AQUA, a], np.nan)}
        for s in (NPP, N20, N21):
            raw[SATS[s]] = np.where(cal.any[s], sat_areas[s, a], np.nan)
        areas.append({
            "id": ids[a], "name": names[a], "model": scores[a]["model"],
            "series": {**{k: series(v, 0) for k, v in raw.items()}, "viirs_eq": series(record[a], 1),
                       "p10": series(lo, 1), "p90": series(hi, 1),
                       # converted MODIS in every month MODIS covers: against viirs_eq from 2012, the seam check
                       "modis_eq": series(np.where(raw["MODIS"] >= 0, recon[a], np.nan), 1)},
            "baseline": baseline(record[a], cal),
            "score": scores[a],
        })
    common = {"id": pid, "label": label, "generated_at_utc": generated, "start_month": cal.label[0],
              "months": cal.months}
    month_info = {"source": [s or None for s in cal.source.tolist()],
                  "satellite": [SATS[s] if s >= 0 else ("MODIS" if src else None)
                                for s, src in zip(cal.viirs.tolist(), cal.source.tolist())],
                  "partial": cal.partial.tolist(), "provisional": cal.provisional.tolist()}
    hashes.append(write_json(con, root, f"{pid}/monthly.json", {
        **common, "unit": "detections", "reference": "NOAA-20", "sensors": ["MODIS", *(SATS[s] for s in (NPP, N20, N21))],
        **month_info, "areas": areas}))

    cell_deg, grid, size = grid_cells(c, cal, R, modis_factor, viirs_factor)
    hashes.append(write_json(con, root, f"{pid}/monthly_grid.json", {
        **common, "version": 6, "unit": "detections", "cell_deg": cell_deg, "series": ["modis", "viirs_eq"],
        "temperature": {"unit": "K", "modis": "MODIS brightness (band 21/22)", "viirs": "VIIRS I4 brightness"},
        **month_info, **grid}))

    rec = con.execute(f"""
        SELECT longitude, latitude,
               strftime(acq_date, '%Y-%m-%d') || 'T' || substr(lpad(CAST(acq_time AS VARCHAR), 4, '0'), 1, 2) || ':'
                   || substr(lpad(CAST(acq_time AS VARCHAR), 4, '0'), 3, 2) || 'Z' AS acquired_utc,
               satellite, CAST(confidence AS VARCHAR) AS confidence, frp, state_id, bright
        FROM read_parquet('{root}/aggregates/country={name}/recent.parquet')
        WHERE acq_date > CAST(? AS DATE) - INTERVAL {RECENT_DAYS} DAY ORDER BY acq_date, acq_time""",
                      [cal.last_day]).fetchall()
    platforms = sorted({r[3] for r in rec})
    rec_states = sorted({r[6] for r in rec if r[6] is not None})
    hashes.append(write_json(con, root, f"{pid}/recent_hotspots.json", {
        "id": pid, "generated_at_utc": generated, "last_day": cal.last_day.isoformat(), "days": RECENT_DAYS,
        "platforms": platforms, "states": [states.get(s, s) for s in rec_states],
        "lon": [round(r[0], 4) for r in rec], "lat": [round(r[1], 4) for r in rec],
        "acquired_utc": [r[2] for r in rec], "platform": [platforms.index(r[3]) for r in rec],
        "state": [rec_states.index(r[6]) if r[6] is not None else -1 for r in rec],
        "confidence": [r[4] for r in rec], "frp": [num(r[5], 2) for r in rec],
        "bright": [num(r[7], 1) for r in rec]}))  # brightness temperature, K (MODIS or VIIRS I4)

    observed_from = next((cal.label[t] for t in range(cal.months) if cal.source[t] == "observed"), None)
    hashes.append(write_json(con, root, f"{pid}/meta.json", {
        **common, "iso": info["iso"], "last_day": cal.last_day.isoformat(),
        "sensors": info["sensors"],
        "record": {"reference": "NOAA-20", "observed_from": observed_from, "method": METHOD},
        "harmonization": {
            "direction": "MODIS -> VIIRS", "fit_months": int(cal.train.sum()),
            "fit_years": [int(cal.year[cal.train].min()), int(cal.year[cal.train].max())] if cal.train.any() else None,
            "k_cell": K_CELL, "k_world": K_WORLD, "fit_deg": FIT_STEP / 10,
            "modis_to_snpp": num(r0, 4), "f_npp": num(fac.f_npp, 4), "f21": num(fac.f21, 4),
            "calendar_month_factor": [num(f, 4) for f in F], "terra_factor": [num(f, 4) for f in fac.terra],
            "world": {"modis_to_snpp": num(world.r0, 4), "f_npp": num(world.f_npp, 4), "f21": num(world.f21, 4)},
            "model": scores[0]["model"], "score": scores[0],
            "states_on_fallback": [ids[a] for a in range(1, len(ids)) if scores[a]["model"] == "ratio_fm"],
        },
        "grid": {"cell_deg": cell_deg, "values": size},
        "sources": SOURCES, "limitations": LIMITATIONS}))

    outline = country_outline(c.state_ids, shapes)
    hashes.append(write_json(con, root, f"{pid}/outline.json", {"id": pid, "geometry": outline}))

    have = np.flatnonzero(c.n > 0)
    bbox = ([round(c.x[have].min() / 10, 1), round(c.y[have].min() / 10, 1),
             round((c.x[have].max() + 1) / 10, 1), round((c.y[have].max() + 1) / 10, 1)] if len(have) else None)
    print(f"{name}: {len(ids) - 1} states, {c.n.sum():,.0f} detections, model {scores[0]['model']} "
          f"(held-out WAPE {scores[0].get('wape', {}).get('cell')}), grid {cell_deg}° ({len(grid["cells"]["west"]):,} cells, "
          f"{size:,} values), {len(rec):,} recent points; {time.monotonic() - t0:.1f}s", flush=True)
    return {"id": pid, "label": label, "kind": "country", "iso": info["iso"], "bbox": bbox, "states": len(ids) - 1,
            "first_month": cal.label[0], "last_day": cal.last_day.isoformat(),
            # changes whenever any of the five files does: the site adds ?v=<version>, so edge caches never serve old files
            "version": hashlib.sha256("".join(hashes).encode()).hexdigest()[:12]}


# --- Output ---------------------------------------------------------------------------------------

def slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


def write_json(con: duckdb.DuckDBPyConnection, root: str, key: str, obj: dict) -> str:
    """exports/<key>, compact; returns the SHA-256 of the text. On R2 through DuckDB (a one-column CSV
    without quoting is the text as is)."""
    text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    target = f"{root}/exports/{key}"
    if is_remote(root):
        con.execute("CREATE OR REPLACE TEMP TABLE payload AS SELECT CAST(? AS VARCHAR) AS j", [text])
        con.execute(f"COPY payload TO '{target}' (FORMAT csv, HEADER false, QUOTE '', ESCAPE '', DELIMITER '\x01')")
    else:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(f"{target}.tmp", "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(f"{target}.tmp", target)
    return hashlib.sha256(text.encode()).hexdigest()


def read_places(con: duckdb.DuckDBPyConnection, root: str) -> list[dict]:
    """The entries of the current exports/places.json, or [] when there is none."""
    try:
        row = con.execute("SELECT content FROM read_text(?)", [f"{root}/exports/places.json"]).fetchone()
    except duckdb.Error:
        return []
    return json.loads(row[0])["places"] if row else []


# --- Run ------------------------------------------------------------------------------------------

def load_reports(con, root: str) -> tuple[dict, dict]:
    """Per-satellite spans world-wide, and per country its sensors and ISO groups."""
    rows = con.execute(f"""
        SELECT a.country, a.satellite, a.first_day, a.last_day, a.provisional_from, a.rows
        FROM read_parquet('{root}/aggregates/_reports/country=*/aggregate.parquet', hive_partitioning = false) a
        WHERE a.satellite IN ({", ".join(f"'{s}'" for s in SATS)})""").fetchall()
    iso = dict(con.execute(f"""
        SELECT country, string_agg(DISTINCT iso, ',') FROM read_parquet('{root}/clean/_reports/country=*/cleaning.parquet', hive_partitioning = false)
        GROUP BY country""").fetchall())
    spans, info = {}, {}
    for country, sat, first, last, prov, n in rows:
        s = SATS.index(sat)
        a, b, p = spans.get(s, (first, last, prov))
        spans[s] = (min(a, first), max(b, last), min(x for x in (p, prov) if x) if (p or prov) else None)
        entry = info.setdefault(country, {"iso": sorted({i for i in (iso.get(country) or "").split(",") if i}),
                                          "sensors": {}})
        entry["sensors"][sat] = {"first_day": first.isoformat(), "last_day": last.isoformat(),
                                 "provisional_from_day": prov.isoformat() if prov else None, "rows": n}
    return spans, info


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True, help="bucket root holding aggregates/, e.g. r2://llama-masters-firms")
    parser.add_argument("--country", action="append", help="export only these countries (their places.json entries are updated)")
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--memory", default="6GB")
    parser.add_argument("--workers", type=int, default=8, help="countries exported at the same time")
    args = parser.parse_args()
    root = args.root.rstrip("/")
    con = connect(root, args.threads, args.memory)
    t0 = time.monotonic()
    spans, info = load_reports(con, root)
    if not spans:
        sys.exit(f"no aggregate reports under {root}/aggregates: run aggregate.py first")
    cal = Calendar(spans)
    print(f"record {cal.label[0]} -> {cal.last_day} ({cal.months} months); fit months {int(cal.train.sum())}; "
          f"observed from {next((cal.label[t] for t in range(cal.months) if cal.source[t] == 'observed'), None)}",
          flush=True)
    # monthly totals per country and satellite: the factor fits (world and country)
    d = con.execute(f"""
        SELECT country, CAST(list_position(?, satellite) - 1 AS INTEGER) AS sat,
               CAST(datediff('month', CAST(? AS DATE), month) AS INTEGER) AS t, sum(n) AS n
        FROM read_parquet('{root}/aggregates/country=*/cells.parquet', hive_partitioning = true, hive_types_autocast = false)
        WHERE satellite IN ({", ".join(f"'{s}'" for s in SATS)}) GROUP BY ALL""", [list(SATS), cal.start]).fetchall()
    totals: dict[str, np.ndarray] = {}
    for country, s, t, n in d:
        if 0 <= t < cal.months:
            totals.setdefault(country, np.zeros((len(SATS), cal.months)))[s, t] += n
    world = Factors(np.sum(list(totals.values()), axis=0), cal)
    print(f"world: MODIS -> S-NPP {world.r0:.3f}, fNPP {world.f_npp:.4f} ({world.pairs['f_npp']} months), "
          f"f21 {world.f21:.4f} ({world.pairs['f21']} months), Terra factor "
          f"{np.round(world.terra, 2).tolist()}", flush=True)
    states, shapes = {}, {}
    for state_id, state, wkb in con.execute(
            f"SELECT state_id, state, ST_AsWKB(geom) FROM read_parquet('{root}/{BOUNDARIES}')").fetchall():
        states[state_id], shapes[state_id] = state, shapely.from_wkb(bytes(wkb))
    generated = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # largest first, so a big country never starts last; each thread has its own DuckDB cursor
    todo = sorted(args.country or totals, key=lambda c: -totals[c].sum() if c in totals else 0)
    places, failed = [], [c for c in todo if c not in totals]
    for country in failed:
        print(f"{country}: no aggregates", flush=True)

    def one_country(country: str) -> dict:
        cur = con.cursor()
        try:
            return export_country(cur, root, country, cal, world, totals[country],
                                  info.get(country, {"iso": [], "sensors": {}}), states, shapes, generated)
        finally:
            cur.close()

    jobs = [c for c in todo if c in totals]
    with ThreadPoolExecutor(args.workers) as pool:
        futures = {pool.submit(one_country, c): c for c in jobs}
        for i, future in enumerate(as_completed(futures), 1):
            country = futures[future]
            try:
                places.append(future.result())
                print(f"[{i}/{len(jobs)}] {country} written", flush=True)
            except (duckdb.Error, OSError, ValueError, RuntimeError, IndexError, KeyError) as error:
                print(f"[{i}/{len(jobs)}] {country}: FAILED: {error}", flush=True)
                failed.append(country)
    if args.country:  # keep the other countries' entries, replace the ones just written
        done = {p["id"] for p in places}
        places += [p for p in read_places(con, root) if p["id"] not in done]
    write_json(con, root, "places.json", {"version": 1, "generated_at_utc": generated,
                                          "last_day": cal.last_day.isoformat(),
                                          "places": sorted(places, key=lambda p: p["label"])})
    print(f"done: {len(places)} places exported, {len(failed)} failed"
          + (f" ({', '.join(failed)})" if failed else "") + f"; {time.monotonic() - t0:.0f}s", flush=True)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
