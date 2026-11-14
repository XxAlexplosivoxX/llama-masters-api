import { MIN_BASELINE_YEARS, type Stats } from "./shared";
import type { MonthlySeries } from "../types";

export interface BandPoint {
  month: number; // 0..11
  value: number | null;
  partial: boolean;
  provisional: boolean;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  n: number;
}

export function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[lo + 1] !== undefined ? (i - lo) * (sorted[lo + 1] - sorted[lo]) : 0);
}

/** Jan–Dec of `focusYear` against the other baseline years' monthly p10/median/p90. */
export function seasonalBand(series: MonthlySeries, stats: Stats, focusYear: number | null): BandPoint[] {
  const baseYears = stats.baselineYears.filter((y) => y !== focusYear);
  return Array.from({ length: 12 }, (_, m) => {
    const own = focusYear !== null ? (focusYear - series.startYear) * 12 + m : null;
    const baseline = baseYears
      .map((y) => series.values[(y - series.startYear) * 12 + m])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const n = baseline.length;
    const enough = n >= MIN_BASELINE_YEARS;
    return {
      month: m,
      value: own !== null ? series.values[own] : null,
      partial: own !== null ? series.partial[own] : false,
      provisional: own !== null && series.provisionalFrom !== undefined && own >= series.provisionalFrom,
      p10: enough ? percentile(baseline, 0.1) : null,
      p50: enough ? percentile(baseline, 0.5) : null,
      p90: enough ? percentile(baseline, 0.9) : null,
      n,
    };
  });
}

/** Median of the baseline years' annual totals (the "typical year"); null without enough years. */
export function medianYear(stats: Stats): number | null {
  if (stats.baselineYears.length < MIN_BASELINE_YEARS) return null;
  return percentile(stats.baselineYears.map((y) => stats.yearTotals.get(y)!).sort((a, b) => a - b), 0.5);
}

export type Position = "below p10" | "p10 to median" | "median to p90" | "above p90";

export interface CurrentMonth {
  index: number;
  value: number;
  partial: boolean;
  provisional: boolean;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  n: number;
  position: Position | null;
  /** value / median − 1, only for complete, non-provisional months. */
  anomaly: number | null;
}

/** Most recent month with data against the same calendar month in the other baseline years. */
export function currentMonth(series: MonthlySeries, stats: Stats): CurrentMonth | null {
  let index = series.values.length - 1;
  while (index >= 0 && series.values[index] === null) index--;
  if (index < 0) return null;
  const year = series.startYear + Math.floor(index / 12);
  const point = seasonalBand(series, stats, year)[index % 12];
  const value = point.value!;
  const { p10, p50, p90, partial, provisional, n } = point;
  const position: Position | null = p10 === null ? null
    : value < p10 ? "below p10" : value > p90! ? "above p90" : value < p50! ? "p10 to median" : "median to p90";
  const anomaly = !partial && !provisional && p50 ? value / p50 - 1 : null;
  return { index, value, partial, provisional, p10, p50, p90, n, position, anomaly };
}
