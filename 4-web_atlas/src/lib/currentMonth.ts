import { MIN_BASELINE_YEARS, MONTHS_LONG, SERIES_LABEL, type Range, type Stats } from "./series";
import type { Meta, MonthlyGrid, MonthlySeries } from "./types";
import { fmt } from "./format";

/** Satellites behind one month of a series: the record's satellite, or Terra + Aqua for MODIS. */
function satellitesOf(grid: MonthlyGrid, series: MonthlySeries, index: number): string[] {
  const used = grid.satellite[index];
  if (series.kind === "MODIS" || used === "MODIS") return ["Terra", "Aqua"];
  return used ? [used] : [];
}

export function currentMonthComparison(
  grid: MonthlyGrid | null,
  meta: Meta | null,
  series: MonthlySeries,
  stats: Stats,
  range: Range,
  now = new Date(),
) {
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth();
  const index = (year - series.startYear) * 12 + month;
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const start = `${ym}-01`;
  const end = `${ym}-${new Date(Date.UTC(year, month + 1, 0)).getUTCDate()}`;
  const label = `${MONTHS_LONG[month]} ${year} to date`;
  const scope = `For this area and sensor view, independent of selected dates.${index < range.from || index > range.to ? " This month is outside the selected range." : ""}`;
  const unavailable = (note: string) => ({ label, value: "Not available", note: `${note} ${scope}` });
  if (!grid || !meta || !series.kind) return unavailable("No monthly record is loaded.");
  const value = series.values[index] ?? null;
  const spans = satellitesOf(grid, series, index)
    .map((s) => meta.sensors[s])
    .filter((s) => s !== undefined);
  if (value === null || !spans.length)
    return unavailable(`No source data for the current calendar month. Latest data: ${meta.last_day} UTC.`);
  const from = spans.map((s) => s.first_day).sort()[0];
  const cutoff = spans
    .map((s) => (s.last_day < end ? s.last_day : end))
    .sort()
    .at(-1)!;
  if (cutoff > now.toISOString().slice(0, 10))
    return unavailable("The source cutoff is after today; monthly totals cannot be truncated to today.");
  const provisional = grid.provisional[index];
  const via = grid.satellite[index];
  const coverage = `${SERIES_LABEL[series.kind]}${series.kind !== "MODIS" && via ? ` (${via === "MODIS" ? "converted MODIS" : via})` : ""}, through ${cutoff} UTC.${provisional ? " Provisional data." : ""}`;
  if (from > start)
    return {
      label,
      value: `${fmt(value)} hotspots (partial coverage)`,
      note: `${coverage} Coverage starts ${from}; this is not a full month-to-date count, so no comparison is shown. ${scope}`,
    };
  const years = stats.baselineYears.filter((y) => y < year);
  if (years.length < MIN_BASELINE_YEARS)
    return {
      label,
      value: `${fmt(value)} hotspots so far`,
      note: `${coverage} A typical month needs at least ${MIN_BASELINE_YEARS} complete baseline years; only ${years.length} are available. ${scope}`,
    };
  const mean = years.reduce((sum, y) => sum + series.values[(y - series.startYear) * 12 + month]!, 0) / years.length;
  const comparison =
    mean > 0
      ? `${Math.round((value / mean) * 100)}% of the full-month mean`
      : "the full-month mean is 0; a percentage is undefined";
  return {
    label,
    value: `${fmt(value)} hotspots so far`,
    note: `${coverage} ${comparison}. Typical ${MONTHS_LONG[month]}: ${fmt(Math.round(mean))} hotspots, arithmetic MEAN (not median) of ${years.length} complete years (${years[0]}–${years.at(-1)}). ${cutoff < end ? "Partial month compared with a full-month mean, not a same-day or daily pace comparison; daily historical totals are unavailable." : "The source covers the full month."} ${scope}`,
  };
}
