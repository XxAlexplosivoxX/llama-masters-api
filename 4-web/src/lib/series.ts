import { contains } from "./geo";
import type { MonthlyFile, MonthlyGrid, MonthlySeries, SeriesKind, Shape } from "./types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const labelOf = (startYear: number, index: number) =>
  `${MONTHS[index % 12]} ${startYear + Math.floor(index / 12)}`;

/** Cells whose centre falls inside the shape, or every cell for the whole place. */
export function cellsIn(grid: MonthlyGrid, shape: Shape | null): number[] {
  const half = grid.cell_deg / 2;
  const picked: number[] = [];
  grid.cells.forEach(([w, s], i) => {
    if (!shape || contains(shape.polygon, w + half, s + half)) picked.push(i);
  });
  return picked;
}

export const SERIES_LABEL: Record<SeriesKind, string> = {
  HARMONIZED: "Harmonized",
  MODIS: "MODIS",
  VIIRS: "VIIRS",
};

/** First year of the averages for the full record and for MODIS (export.py BASELINE_YEARS). */
const BASELINE_FROM = 2003;

/**
 * Per-cell monthly values for one series kind, expanded once per place.
 * Harmonized: the record as exported (real VIIRS on the NOAA-20 scale, converted MODIS before).
 * VIIRS: the same record, only in months a VIIRS satellite observed. MODIS: raw Terra + Aqua.
 */
export function cellValues(grid: MonthlyGrid, kind: SeriesKind): number[][] {
  return grid.cells.map((c) => {
    const values: number[] = Array(grid.months).fill(0);
    const sparse = kind === "MODIS" ? c[2] : c[3];
    for (let i = 0; i < sparse.length; i += 2) {
      const m = sparse[i];
      if (kind === "VIIRS" && grid.source[m] !== "observed") continue;
      values[m] = sparse[i + 1];
    }
    return values;
  });
}

/** Which months a series covers, where provisional data begins. */
export function coverage(grid: MonthlyGrid, kind: SeriesKind) {
  const startYear = Number(grid.start_month.slice(0, 4));
  const covered = (m: number) => (kind === "VIIRS" ? grid.source[m] === "observed" : grid.source[m] !== null);
  let first = 0;
  while (first < grid.months && !covered(first)) first++;
  let last = grid.months - 1;
  while (last > first && !covered(last)) last--;
  let provisionalFrom: number | undefined;
  for (let m = first; m <= last; m++)
    if (covered(m) && grid.provisional[m]) {
      provisionalFrom = m;
      break;
    }
  return { startYear, first, last, covered, provisionalFrom };
}

const SOURCE: Record<SeriesKind, string> = {
  HARMONIZED: "Harmonized record on the NOAA-20 VIIRS scale: real VIIRS from 2012, MODIS converted before",
  MODIS: "MODIS (Terra + Aqua), raw hotspots",
  VIIRS: "VIIRS on the NOAA-20 scale, months a VIIRS satellite observed",
};

export function gridSeries(grid: MonthlyGrid, values: number[][], cells: number[], kind: SeriesKind): MonthlySeries {
  const { startYear, first, last, covered, provisionalFrom } = coverage(grid, kind);
  const out: (number | null)[] = Array.from({ length: grid.months }, (_, m) =>
    m < first || m > last || !covered(m) ? null : 0,
  );
  for (const i of cells) {
    const counts = values[i];
    for (let m = first; m <= last; m++) if (out[m] !== null) out[m]! += counts[m];
  }
  return {
    startYear,
    values: out,
    partial: grid.partial.map((p, m) => p && out[m] !== null),
    kind,
    provisionalFrom,
    source: SOURCE[kind],
    baselineFrom: kind === "VIIRS" ? undefined : BASELINE_FROM,
    baselineNote:
      kind === "VIIRS"
        ? undefined
        : `Averages use complete years from ${BASELINE_FROM}: before that, only Terra flew for part of the time.`,
  };
}

/**
 * The seam check for one area of monthly.json (0 = the whole country): MODIS converted to the
 * NOAA-20 scale in every month, against the real VIIRS months. Where both exist (2012 on) the two
 * should match; that is what lets the converted years stand in for VIIRS before 2012.
 */
export function seamSeries(monthly: MonthlyFile, area = 0): { converted: MonthlySeries; observed: MonthlySeries } {
  const a = monthly.areas[area];
  const startYear = Number(monthly.start_month.slice(0, 4));
  const make = (values: (number | null)[], source: string): MonthlySeries => ({
    startYear,
    values,
    partial: monthly.partial.map((p, m) => p && values[m] !== null),
    source,
    provisionalFrom:
      monthly.provisional.findIndex((p, m) => p && values[m] !== null) >= 0
        ? monthly.provisional.findIndex((p, m) => p && values[m] !== null)
        : undefined,
  });
  return {
    converted: make(a.series.modis_eq, "MODIS converted to the NOAA-20 scale"),
    observed: make(
      a.series.viirs_eq.map((v, m) => (monthly.source[m] === "observed" ? v : null)),
      "VIIRS observed, NOAA-20 scale",
    ),
  };
}

export interface Range {
  from: number;
  to: number;
} // inclusive month indexes

export interface Stats {
  years: number[];
  complete: (y: number) => boolean;
  climatology: (number | null)[]; // mean per month of year over complete years
  baselineYears: number[];
  yearTotals: Map<number, number | null>;
  meanYear: number | null;
  rangeTotal: number;
  rangeMonths: number;
  peak: { from: number; to: number; share: number } | null; // 3-month window of the average year
}

const usable = (s: MonthlySeries, m: number) => s.values[m] !== null && !s.partial[m];

export const MIN_BASELINE_YEARS = 3;

export function computeStats(s: MonthlySeries, range: Range): Stats {
  const nYears = s.values.length / 12;
  const years = Array.from({ length: nYears }, (_, i) => s.startYear + i);
  const complete = (y: number) => {
    const base = (y - s.startYear) * 12;
    for (let m = 0; m < 12; m++) if (!usable(s, base + m)) return false;
    return true;
  };
  const baselineYears = years.filter((y) => complete(y) && y >= (s.baselineFrom ?? -Infinity));
  const yearTotals = new Map<number, number | null>();
  for (const y of years) {
    const base = (y - s.startYear) * 12;
    yearTotals.set(y, complete(y) ? s.values.slice(base, base + 12).reduce<number>((a, v) => a + (v ?? 0), 0) : null);
  }
  const hasBaseline = baselineYears.length >= MIN_BASELINE_YEARS;
  const climatology = MONTHS.map((_, m) => {
    if (!hasBaseline) return null;
    const vals = baselineYears.map((y) => s.values[(y - s.startYear) * 12 + m]!);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const totals = baselineYears.map((y) => yearTotals.get(y)!);
  const meanYear = hasBaseline ? totals.reduce((a, b) => a + b, 0) / totals.length : null;

  let rangeTotal = 0;
  let rangeMonths = 0;
  for (let m = range.from; m <= range.to; m++) {
    if (s.values[m] !== null) {
      rangeTotal += s.values[m]!;
      rangeMonths++;
    }
  }

  let peak: Stats["peak"] = null;
  if (hasBaseline && meanYear) {
    for (let m = 0; m < 12; m++) {
      const sum = [0, 1, 2].reduce((a, k) => a + climatology[(m + k) % 12]!, 0);
      if (!peak || sum / meanYear > peak.share) peak = { from: m, to: (m + 2) % 12, share: sum / meanYear };
    }
  }
  return { years, complete, climatology, baselineYears, yearTotals, meanYear, rangeTotal, rangeMonths, peak };
}

/** 1 = most active complete year. */
export function rankOf(stats: Stats, year: number): number | null {
  const value = stats.yearTotals.get(year);
  if (value == null) return null;
  return stats.baselineYears.filter((y) => stats.yearTotals.get(y)! > value).length + 1;
}

export function latestCompleteYear(stats: Stats, range: Range, startYear: number): number | null {
  const lastYear = startYear + Math.floor(range.to / 12);
  return [...stats.baselineYears].reverse().find((y) => y <= lastYear) ?? null;
}

export function fullRange(s: MonthlySeries): Range {
  const first = s.values.findIndex((v) => v !== null);
  let last = s.values.length - 1;
  while (last > 0 && s.values[last] === null) last--;
  return { from: Math.max(first, 0), to: last };
}
