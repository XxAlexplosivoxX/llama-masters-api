import { contains } from "./geo";
import type { MonthlyGrid, MonthlySeries, SeriesKind, Shape, WeeklyRow } from "./types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

const monthIndex = (ym: string, startYear: number) =>
  (Number(ym.slice(0, 4)) - startYear) * 12 + Number(ym.slice(5, 7)) - 1;

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
  HARMONIZED: "Harmonized", MODIS: "MODIS", VIIRS: "VIIRS", MODIS_EQ: "VIIRS on the MODIS scale",
};

/** VIIRS detections in one cell-month on the MODIS scale: k_m · ((1 + v)^β_m − 1). */
export function modisEquivalent(grid: MonthlyGrid, viirs: number, month: number): number {
  if (viirs <= 0) return 0;
  const c = grid.harmonization.coefficients[month % 12];
  return c.k * ((1 + viirs) ** c.beta - 1);
}

/**
 * Per-cell monthly values for one series kind. The adjustment is applied cell by cell, then summed.
 * Harmonized: the mean of MODIS and VIIRS-on-the-MODIS-scale in months both sensors fully cover,
 * otherwise whichever one has data (MODIS alone before 2012).
 */
export function cellValues(grid: MonthlyGrid, kind: SeriesKind): number[][] {
  const source = kind === "HARMONIZED" ? harmonizedSource(grid) : null;
  return grid.cells.map((c) => {
    const values: number[] = Array(grid.months).fill(0);
    if (kind === "MODIS" || source) {
      for (let i = 0; i < c[2].length; i += 2) {
        const m = c[2][i], v = c[2][i + 1];
        values[m] = source?.[m] === "both" ? v / 2 : source?.[m] === "VIIRS" ? 0 : v;
      }
    }
    if (kind !== "MODIS") {
      for (let i = 0; i < c[3].length; i += 2) {
        const m = c[3][i], v = c[3][i + 1];
        const eq = kind === "VIIRS" ? v : modisEquivalent(grid, v, m);
        if (!source || source[m] === "VIIRS") values[m] = eq;
        else if (source[m] === "both") values[m] += eq / 2;
      }
    }
    return values;
  });
}

/** Which sensor the harmonized record uses in each month. */
export function harmonizedSource(grid: MonthlyGrid): ("both" | "MODIS" | "VIIRS" | null)[] {
  const m = sensorCoverage(grid, "MODIS"), v = sensorCoverage(grid, "VIIRS");
  const full = (c: typeof m, i: number) => i >= c.first + (c.firstPartial ? 1 : 0) && i <= c.last - (c.lastPartial ? 1 : 0);
  const any = (c: typeof m, i: number) => i >= c.first && i <= c.last;
  return Array.from({ length: grid.months }, (_, i) =>
    full(m, i) && full(v, i) ? "both" : any(m, i) ? "MODIS" : any(v, i) ? "VIIRS" : null);
}

/** Month indexes a series fully covers, partly covers, and where provisional data begins. */
export function coverage(grid: MonthlyGrid, kind: SeriesKind) {
  if (kind !== "HARMONIZED") return sensorCoverage(grid, kind === "MODIS" ? "MODIS" : "VIIRS");
  const m = sensorCoverage(grid, "MODIS"), v = sensorCoverage(grid, "VIIRS");
  const later = v.last > m.last ? v : m;
  const provisional = [m.provisionalFrom, v.provisionalFrom].filter((x): x is number => x !== undefined);
  return {
    ...m, last: later.last, lastPartial: later.lastPartial,
    provisionalFrom: provisional.length ? Math.min(...provisional) : undefined,
  };
}

function sensorCoverage(grid: MonthlyGrid, sensor: "MODIS" | "VIIRS") {
  const info = grid.sensors[sensor];
  const startYear = Number(grid.start_month.slice(0, 4));
  const first = monthIndex(info.first_source_day.slice(0, 7), startYear);
  const last = monthIndex(info.last_source_day.slice(0, 7), startYear);
  const endOfMonth = (day: string) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.getUTCDate() === 1;
  };
  return {
    startYear, first, last, info,
    firstPartial: !info.first_source_day.endsWith("-01"),
    lastPartial: !endOfMonth(info.last_source_day),
    provisionalFrom: info.provisional_from_day ? monthIndex(info.provisional_from_day.slice(0, 7), startYear) : undefined,
  };
}

export function gridSeries(grid: MonthlyGrid, values: number[][], cells: number[], kind: SeriesKind): MonthlySeries {
  const { startYear, first, last, info, firstPartial, lastPartial, provisionalFrom } = coverage(grid, kind);
  const out: (number | null)[] = Array.from({ length: grid.months }, (_, m) => (m < first || m > last ? null : 0));
  for (const i of cells) {
    const counts = values[i];
    for (let m = first; m <= last; m++) out[m]! += counts[m];
  }
  const partial = out.map((_, m) => (m === first && firstPartial) || (m === last && lastPartial));
  return {
    startYear, values: out, partial, approximate: false, kind, provisionalFrom,
    source: kind === "HARMONIZED"
      ? "Harmonized MODIS + VIIRS on the MODIS scale (MODIS alone before 2012)"
      : kind === "MODIS_EQ" ? `VIIRS on the MODIS scale, estimated from ${info.series}` : info.series,
    baselineFrom: info.baseline_from_year, baselineNote: info.baseline_note,
  };
}

/** How close the MODIS-equivalent series is to real MODIS for these cells, over the held-out years. */
export function localCheck(grid: MonthlyGrid, modis: number[][], eq: number[][], cells: number[]) {
  const startYear = Number(grid.start_month.slice(0, 4));
  const [a, b] = grid.harmonization.test_years;
  let absError = 0, actual = 0, fitted = 0;
  for (let m = (a - startYear) * 12; m < (b - startYear + 1) * 12; m++) {
    let A = 0, P = 0;
    for (const i of cells) { A += modis[i][m]; P += eq[i][m]; }
    absError += Math.abs(P - A); actual += A; fitted += P;
  }
  if (actual < 50) return null; // too few detections to say anything
  return { years: [a, b] as const, wape: absError / actual, bias: fitted / actual - 1, actual };
}

/** Annual totals per series for these cells, over the years both sensors fully cover. */
export function annualComparison(grid: MonthlyGrid, all: Record<"MODIS" | "VIIRS" | "MODIS_EQ", number[][]>, cells: number[]) {
  const startYear = Number(grid.start_month.slice(0, 4));
  const modis = coverage(grid, "MODIS"), viirs = coverage(grid, "VIIRS");
  const firstYear = startYear + Math.ceil((Math.max(modis.first, viirs.first) + (viirs.firstPartial ? 1 : 0)) / 12);
  const lastFull = Math.min(modis.last - (modis.lastPartial ? 1 : 0), viirs.last - (viirs.lastPartial ? 1 : 0));
  const lastYear = startYear + Math.floor((lastFull + 1) / 12) - 1;
  const rows: { year: number; MODIS: number; VIIRS: number; MODIS_EQ: number }[] = [];
  for (let y = firstYear; y <= lastYear; y++) rows.push({ year: y, MODIS: 0, VIIRS: 0, MODIS_EQ: 0 });
  const from = (firstYear - startYear) * 12, to = (lastYear - startYear + 1) * 12;
  for (const kind of ["MODIS", "VIIRS", "MODIS_EQ"] as const) {
    for (const i of cells) {
      const v = all[kind][i];
      for (let m = from; m < to; m++) rows[Math.floor((m - from) / 12)][kind] += v[m] ?? 0;
    }
  }
  return rows;
}

/**
 * Weeks to calendar months: each ISO week goes to the month holding its Thursday (the ISO
 * convention for week ownership). Labelled approximate until a monthly export exists.
 */
export function weeklyToMonthly(rows: WeeklyRow[], platform: string, areaId: string): MonthlySeries | null {
  const picked = rows.filter((r) => r.platform === platform && r.area_id === areaId);
  if (!picked.length) return null;
  const owner = (r: WeeklyRow) => {
    const d = new Date(`${r.week_start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 3);
    return d.toISOString().slice(0, 7);
  };
  const months = picked.map(owner);
  const startYear = Number(months.reduce((a, b) => (a < b ? a : b)).slice(0, 4));
  const endYear = Number(months.reduce((a, b) => (a > b ? a : b)).slice(0, 4));
  const length = (endYear - startYear + 1) * 12;
  const values: (number | null)[] = Array(length).fill(null);
  const weeks = Array(length).fill(0);
  const partial: boolean[] = Array(length).fill(false);
  picked.forEach((row, i) => {
    const m = monthIndex(months[i], startYear);
    weeks[m]++;
    if (row.reported_detections !== null) values[m] = (values[m] ?? 0) + row.reported_detections;
    if (!row.week_complete || !row.source_complete) partial[m] = true;
  });
  // A month is complete only when every week it owns is present and complete.
  for (let m = 0; m < length; m++) {
    const year = startYear + Math.floor(m / 12);
    if (weeks[m] < thursdaysIn(year, m % 12)) partial[m] = true;
  }
  return { startYear, values, partial, approximate: true, source: `${platform}, from ISO weeks` };
}

function thursdaysIn(year: number, month: number): number {
  let count = 0;
  for (let d = new Date(Date.UTC(year, month, 1)); d.getUTCMonth() === month; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 4) count++;
  }
  return count;
}

export interface Range { from: number; to: number } // inclusive month indexes

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
    if (s.values[m] !== null) { rangeTotal += s.values[m]!; rangeMonths++; }
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
