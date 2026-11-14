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

function percentile(sorted: number[], p: number): number {
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
