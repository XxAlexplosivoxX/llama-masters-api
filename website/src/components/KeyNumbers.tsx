import { useMemo } from "react";
import { anomalyScale } from "../lib/color";
import { fmt, fmtCompact, fmtPercent, ordinal } from "../lib/format";
import { labelOf, MIN_BASELINE_YEARS, MONTHS, MONTHS_LONG, rankOf, type Range, type Stats } from "../lib/series";
import type { Hotspot, MonthlyGrid, MonthlySeries } from "../lib/types";
import { currentMonthComparison } from "../lib/currentMonth";

interface Props {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  focusYear: number | null;
  mapMonth: number | null;
  playing: boolean;
  grid: MonthlyGrid | null;
  recent: Hotspot[] | null; // last 7 days in the area, every sensor
}

const anomaly = anomalyScale(0.8);

function Row({ label, value, note, color }: { label: string; value: React.ReactNode; note?: React.ReactNode; color?: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-3 border-t border-border/60 py-2.5 first:border-t-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd>
        <span className="num text-lg font-semibold leading-tight" style={{ color }}>{value}</span>
        {note && <span className="mt-0.5 block text-xs leading-snug text-muted">{note}</span>}
      </dd>
    </div>
  );
}

/**
 * This week against a typical week of the same month: MODIS points only, because the
 * monthly record is on the MODIS scale. Returns null without enough history.
 */
function thisWeek(recent: Hotspot[] | null, stats: Stats) {
  if (!recent?.length) return null;
  const last = recent.reduce((a, p) => (p.acquired_utc > a ? p.acquired_utc : a), "");
  const month = Number(last.slice(5, 7)) - 1;
  const year = Number(last.slice(0, 4));
  const clim = stats.climatology[month];
  if (clim === null) return null;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const typical = (clim / days) * 7;
  const modis = recent.filter((p) => p.platform === "Terra" || p.platform === "Aqua").length;
  return { modis, typical, ratio: typical > 0 ? modis / typical : null, month };
}

export function KeyNumbers({ series, stats, range, focusYear, recent, mapMonth, playing, grid }: Props) {
  const total = focusYear !== null ? stats.yearTotals.get(focusYear) ?? null : null;
  const rel = total !== null && stats.meanYear ? total / stats.meanYear - 1 : null;
  const inBaseline = focusYear !== null && stats.baselineYears.includes(focusYear);
  const rank = inBaseline ? rankOf(stats, focusYear) : null;
  const first = stats.baselineYears[0], lastBase = stats.baselineYears.at(-1);
  const week = useMemo(() => (series.kind === "VIIRS" ? null : thisWeek(recent, stats)), [series.kind, recent, stats]);
  const current = useMemo(() => currentMonthComparison(grid, series, stats, range), [grid, series, stats, range.from, range.to]);
  const frame = mapMonth === null ? null : series.values[mapMonth] ?? null;

  return (
    <dl>
      {mapMonth !== null && (
        <Row label={labelOf(series.startYear, mapMonth)} value={frame === null ? "No source data" : `${fmt(frame)} hotspots`}
          note={`${playing ? "Now playing" : "Shown"} on the map.${series.partial[mapMonth] ? " Partial month." : ""}${series.provisionalFrom !== undefined && mapMonth >= series.provisionalFrom ? " Provisional data." : ""}`} />
      )}
      <Row label="Fire season"
        value={stats.peak ? `${MONTHS_LONG[stats.peak.from]} to ${MONTHS_LONG[stats.peak.to]}` : "Not enough years"}
        note={stats.peak
          ? `${Math.round(stats.peak.share * 100)}% of a typical year's hotspots fall in these three months.`
          : `Needs ${MIN_BASELINE_YEARS} complete years.`} />
      {focusYear !== null && (
        <Row label={String(focusYear)}
          value={rel !== null ? `${fmtPercent(rel)} vs annual mean` : total === null ? "Year not complete" : `${fmt(total)} hotspots`}
          color={rel !== null ? anomaly(rel) : undefined}
          note={total !== null && stats.meanYear !== null
            ? <>{fmt(total)} hotspots in the complete year; annual mean {fmt(Math.round(stats.meanYear))} ({first}–{lastBase}).{" "}
              {stats.meanYear === 0 ? "The annual mean is zero; a percentage is undefined." : rank !== null ? (rank === 1 ? "The most active year." : `${ordinal(rank)} most active of ${stats.baselineYears.length} years.`) : `Before ${series.baselineFrom}, so not ranked.`}</>
            : total === null ? "Pick a complete year in the calendar." : `Annual comparison needs ${MIN_BASELINE_YEARS} complete baseline years.`} />
      )}
      <Row label={current.label} value={current.value} note={current.note} />
      {week && week.ratio !== null && (
        <Row label="Last 7 days"
          value={week.ratio >= 0.95 && week.ratio <= 1.05 ? "About normal" : `${week.ratio.toFixed(1)}× a typical week`}
          color={anomaly(week.ratio - 1)}
          note={`${fmt(week.modis)} MODIS hotspots; a typical ${MONTHS[week.month]} week has about ${fmt(Math.round(week.typical))}. Provisional data.`} />
      )}
      <Row label="Selected dates" value={stats.rangeMonths ? `${fmtCompact(Math.round(stats.rangeTotal))} hotspots` : "No source data"}
        note={`${labelOf(series.startYear, range.from)} to ${labelOf(series.startYear, range.to)}`} />
    </dl>
  );
}
