import { MIN_BASELINE_YEARS, MONTHS_LONG, type Range, type Stats } from "./series";
import type { MonthlySeries } from "./types";

export function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p, lo = Math.floor(i);
  return sorted[lo] + (i - lo) * ((sorted[lo + 1] ?? sorted[lo]) - sorted[lo]);
}

function distribution(values: number[]) {
  if (values.length < MIN_BASELINE_YEARS) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { p10: percentile(sorted, 0.1), median: percentile(sorted, 0.5), p90: percentile(sorted, 0.9) };
}

export function seasonalBand(series: MonthlySeries, stats: Stats, focus: number | null) {
  const years = stats.baselineYears.filter((year) => year !== focus);
  return Array.from({ length: 12 }, (_, month) => {
    const index = focus === null ? -1 : (focus - series.startYear) * 12 + month;
    return {
      month, index, value: series.values[index] ?? null, partial: series.partial[index] ?? false,
      provisional: series.provisionalFrom !== undefined && index >= series.provisionalFrom,
      band: distribution(years.map((year) => series.values[(year - series.startYear) * 12 + month]!)),
      n: years.length,
    };
  });
}

export function seasonalAnswer(points: ReturnType<typeof seasonalBand>, focus: number | null) {
  if (focus === null) return "Choose a year in the calendar to compare its months.";
  if (!points[0].band) return `The usual range needs ${MIN_BASELINE_YEARS} other complete baseline years.`;
  const complete = points.filter((p) => p.value !== null && !p.partial);
  if (!complete.length) return `${focus} has no complete months to compare.`;
  const high = complete.filter((p) => p.value! > p.band!.p90);
  const low = complete.filter((p) => p.value! < p.band!.p10);
  const names = (rows: typeof points) => rows.length <= 2 ? rows.map((p) => MONTHS_LONG[p.month]).join(" and ") : `${rows.length} months`;
  const verb = (rows: typeof points) => rows.length === 1 ? "was" : "were";
  return high.length ? `In ${focus}, ${names(high)} ${verb(high)} above the usual range.`
    : low.length ? `In ${focus}, ${names(low)} ${verb(low)} below the usual range.`
    : `All ${complete.length} complete months available in ${focus} were within the usual range.`;
}

export function latestCompleteMonth(series: MonthlySeries, stats: Stats) {
  let index = series.values.length - 1;
  while (index >= 0 && (series.values[index] === null || series.partial[index])) index--;
  if (index < 0) return null;
  const year = series.startYear + Math.floor(index / 12), month = index % 12, value = series.values[index]!;
  const baseline = stats.baselineYears.filter((y) => y < year)
    .map((y) => ({ year: y, value: series.values[(y - series.startYear) * 12 + month]!,
      provisional: series.provisionalFrom !== undefined && (y - series.startYear) * 12 + month >= series.provisionalFrom }));
  const band = distribution(baseline.map((p) => p.value));
  const eligible = year >= (series.baselineFrom ?? -Infinity);
  return {
    index, year, month, value, baseline, band,
    rank: band && eligible ? 1 + baseline.filter((p) => p.value > value).length : null,
    provisional: series.provisionalFrom !== undefined && index >= series.provisionalFrom,
  };
}

export function completeAnnual(series: MonthlySeries, range: Range) {
  const rows: { year: number; value: number; provisional: boolean }[] = [];
  for (let base = 0; base + 11 < series.values.length; base += 12) {
    if (base < range.from || base + 11 > range.to) continue;
    const values = series.values.slice(base, base + 12);
    if (values.some((v, month) => v === null || series.partial[base + month])) continue;
    rows.push({ year: series.startYear + base / 12, value: values.reduce<number>((sum, v) => sum + v!, 0),
      provisional: series.provisionalFrom !== undefined && base + 11 >= series.provisionalFrom });
  }
  return rows;
}

export function fmtTick(value: number): string {
  if (Math.abs(value) < 1000) return String(Math.round(value));
  const unit = Math.abs(value) < 1_000_000 ? 1000 : 1_000_000;
  return `${Math.round(value / unit * 10) / 10}${unit === 1000 ? "k" : "M"}`;
}

export const thinBy = (slot: number, label = 32) => Math.max(1, Math.ceil(label / Math.max(slot, 1)));
