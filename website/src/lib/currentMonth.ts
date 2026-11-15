import { harmonizedSource, MIN_BASELINE_YEARS, MONTHS_LONG, SERIES_LABEL, type Range, type Stats } from "./series";
import type { MonthlyGrid, MonthlySeries, SensorId } from "./types";
import { fmt } from "./format";

export function currentMonthComparison(grid: MonthlyGrid | null, series: MonthlySeries, stats: Stats, range: Range, now = new Date()) {
  const year = now.getUTCFullYear(), month = now.getUTCMonth();
  const index = (year - series.startYear) * 12 + month;
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const start = `${ym}-01`;
  const end = `${ym}-${new Date(Date.UTC(year, month + 1, 0)).getUTCDate()}`;
  const label = `${MONTHS_LONG[month]} ${year} to date`;
  const scope = `For this area and sensor view, independent of selected dates.${index < range.from || index > range.to ? " This month is outside the selected range." : ""}`;
  const unavailable = (note: string) => ({ label, value: "Not available", note: `${note} ${scope}` });
  if (!grid || !series.kind || series.approximate) return unavailable("Weekly exports cannot provide an exact calendar month-to-date cutoff.");
  const source = series.kind === "HARMONIZED" ? harmonizedSource(grid)[index] : series.kind === "MODIS" ? "MODIS" : "VIIRS";
  const sensors: SensorId[] = source === "both" ? ["MODIS", "VIIRS"] : source ? [source] : [];
  const value = series.values[index] ?? null;
  if (!sensors.length || value === null) {
    const candidates: SensorId[] = series.kind === "HARMONIZED" ? ["MODIS", "VIIRS"] : [series.kind === "MODIS" ? "MODIS" : "VIIRS"];
    const last = candidates.map((s) => grid.sensors[s].last_source_day).sort().at(-1);
    return unavailable(`No source data for the current calendar month. Latest source cutoff: ${last} UTC.`);
  }
  const from = sensors.map((s) => grid.sensors[s].first_source_day).sort().at(-1)!;
  const cutoff = sensors.map((s) => grid.sensors[s].last_source_day < end ? grid.sensors[s].last_source_day : end).sort()[0];
  if (cutoff > now.toISOString().slice(0, 10)) return unavailable("The source cutoff is after today; monthly totals cannot be truncated to today.");
  const provisional = sensors.some((s) => {
    const day = grid.sensors[s].provisional_from_day;
    return day !== null && day <= cutoff;
  });
  const coverage = `${SERIES_LABEL[series.kind]}${series.kind === "HARMONIZED" ? ` (${source === "both" ? "both sensors" : `${source} contribution`})` : ""}, through ${cutoff} UTC.${provisional ? " Provisional data." : ""}`;
  if (from > start) return { label, value: `${fmt(value)} hotspots (partial coverage)`, note: `${coverage} Coverage starts ${from}; this is not a full month-to-date count, so no comparison is shown. ${scope}` };
  const years = stats.baselineYears.filter((y) => y < year);
  if (years.length < MIN_BASELINE_YEARS) return { label, value: `${fmt(value)} hotspots so far`, note: `${coverage} A typical month needs at least ${MIN_BASELINE_YEARS} complete baseline years; only ${years.length} are available. ${scope}` };
  const mean = years.reduce((sum, y) => sum + series.values[(y - series.startYear) * 12 + month]!, 0) / years.length;
  const comparison = mean > 0 ? `${Math.round(value / mean * 100)}% of the full-month mean` : "the full-month mean is 0; a percentage is undefined";
  return {
    label,
    value: `${fmt(value)} hotspots so far`,
    note: `${coverage} ${comparison}. Typical ${MONTHS_LONG[month]}: ${fmt(Math.round(mean))} hotspots, arithmetic MEAN (not median) of ${years.length} complete years (${years[0]}–${years.at(-1)}). ${cutoff < end ? "Partial month compared with a full-month mean, not a same-day or daily pace comparison; daily historical totals are unavailable." : "The source covers the full month."} ${scope}`,
  };
}
