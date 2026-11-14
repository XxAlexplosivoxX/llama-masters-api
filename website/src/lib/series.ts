import { contains } from "./geo";
import type { MonthlyGrid, MonthlySeries, Shape, WeeklyRow } from "./types";

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

export function gridSeries(grid: MonthlyGrid, cells: number[]): MonthlySeries {
  const startYear = Number(grid.start_month.slice(0, 4));
  const first = monthIndex(grid.first_source_month, startYear);
  const last = monthIndex(grid.last_source_month, startYear);
  const values: (number | null)[] = Array.from({ length: grid.months }, (_, m) => (m < first || m > last ? null : 0));
  for (const i of cells) {
    const counts = grid.cells[i][2];
    for (let m = first; m <= last; m++) values[m]! += counts[m];
  }
  return {
    startYear, values, partial: values.map(() => false), approximate: false, source: grid.series,
    baselineFrom: grid.baseline_from_year, baselineNote: grid.baseline_note,
  };
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
