import { useMemo } from "react";
import { anomalyScale } from "../lib/color";
import { fmt, fmtPercent, ordinal } from "../lib/format";
import { labelOf, MIN_BASELINE_YEARS, MONTHS, MONTHS_LONG, rankOf, type Range, type Stats } from "../lib/series";
import type { Hotspot, Meta, MonthlyGrid, MonthlySeries, SeriesKind } from "../lib/types";
import { currentMonthComparison } from "../lib/currentMonth";

interface Props {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  focusYear: number | null;
  mapMonth: number | null;
  playing: boolean;
  grid: MonthlyGrid | null;
  meta: Meta | null;
  recent: Hotspot[] | null; // last 7 days in the area, every sensor
}

const anomaly = anomalyScale(0.8);

function Row({
  label,
  value,
  note,
  detail,
  color,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  detail?: string;
  color?: string;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-3 border-t border-border/60 py-2.5 first:border-t-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd>
        <span className="num text-lg font-semibold leading-tight" style={{ color }}>
          {value}
        </span>
        {note && <span className="mt-0.5 block text-xs leading-snug text-muted">{note}</span>}
        {detail && (
          <details className="mt-1 text-xs">
            <summary className="link inline cursor-pointer">How is this calculated?</summary>
            <span className="mt-0.5 block leading-snug text-muted">{detail}</span>
          </details>
        )}
      </dd>
    </div>
  );
}

/**
 * This week against a typical week of the same month, counting points on the record's scale:
 * NOAA-20 for the harmonized and VIIRS views (the record is on the NOAA-20 scale), Terra + Aqua
 * for MODIS. Returns null without enough history.
 */
function thisWeek(recent: Hotspot[] | null, stats: Stats, kind: SeriesKind | undefined) {
  if (!recent?.length) return null;
  const last = recent.reduce((a, p) => (p.acquired_utc > a ? p.acquired_utc : a), "");
  const month = Number(last.slice(5, 7)) - 1;
  const year = Number(last.slice(0, 4));
  const clim = stats.climatology[month];
  if (clim === null) return null;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const typical = (clim / days) * 7;
  const sensor = kind === "MODIS" ? "MODIS" : "NOAA-20";
  const count = recent.filter((p) =>
    kind === "MODIS" ? p.platform === "Terra" || p.platform === "Aqua" : p.platform === "NOAA-20",
  ).length;
  return { count, sensor, typical, ratio: typical > 0 ? count / typical : null, month };
}

export function KeyNumbers({ series, stats, range, focusYear, recent, mapMonth, playing, grid, meta }: Props) {
  const total = focusYear !== null ? (stats.yearTotals.get(focusYear) ?? null) : null;
  // Sum of the months with source data, for a year that is not complete (the year in progress).
  const soFar =
    focusYear !== null && total === null
      ? series.values
          .slice((focusYear - series.startYear) * 12, (focusYear - series.startYear) * 12 + 12)
          .reduce<number>((a, v) => a + (v ?? 0), 0)
      : null;
  const rel = total !== null && stats.meanYear ? total / stats.meanYear - 1 : null;
  const inBaseline = focusYear !== null && stats.baselineYears.includes(focusYear);
  const rank = inBaseline ? rankOf(stats, focusYear) : null;
  const first = stats.baselineYears[0],
    lastBase = stats.baselineYears.at(-1);
  const week = useMemo(() => thisWeek(recent, stats, series.kind), [series.kind, recent, stats]);
  const current = useMemo(
    () => currentMonthComparison(grid, meta, series, stats, range),
    [grid, meta, series, stats, range.from, range.to],
  );
  const frame = mapMonth === null ? null : (series.values[mapMonth] ?? null);

  return (
    <dl>
      {mapMonth !== null && (
        <Row
          label={labelOf(series.startYear, mapMonth)}
          value={frame === null ? "No source data" : `${fmt(frame)} hotspots`}
          note={`${playing ? "Now playing" : "Shown"} on the map.${series.partial[mapMonth] ? " Partial month." : ""}${series.provisionalFrom !== undefined && mapMonth >= series.provisionalFrom ? " Provisional data." : ""}`}
        />
      )}
      {week && week.ratio !== null && (
        <Row
          label="Last 7 days"
          value={week.ratio >= 0.95 && week.ratio <= 1.05 ? "About normal" : `${week.ratio.toFixed(1)}× a typical week`}
          color={anomaly(week.ratio - 1)}
          note={`${fmt(week.count)} ${week.sensor} hotspots; a typical ${MONTHS[week.month]} week has about ${fmt(Math.round(week.typical))}. Provisional data.`}
        />
      )}
      <Row label={current.label} value={current.value} note={current.note} detail={current.detail} />
      {focusYear !== null && (
        <Row
          label={String(focusYear)}
          value={
            rel !== null
              ? `${fmtPercent(rel)} vs annual mean`
              : total === null
                ? `${fmt(soFar!)} hotspots so far`
                : `${fmt(total)} hotspots`
          }
          color={rel !== null ? anomaly(rel) : undefined}
          note={
            total !== null && stats.meanYear !== null ? (
              <>
                {fmt(total)} hotspots in the complete year; annual mean {fmt(Math.round(stats.meanYear))} ({first}–
                {lastBase}).{" "}
                {stats.meanYear === 0
                  ? "The annual mean is zero; a percentage is undefined."
                  : rank !== null
                    ? rank === 1
                      ? "The most active year."
                      : `${ordinal(rank)} most active of ${stats.baselineYears.length} years.`
                    : `Before ${series.baselineFrom}, so not ranked.`}
              </>
            ) : total === null ? (
              focusYear === new Date().getUTCFullYear() ? (
                "Year in progress, so not compared with the annual mean yet."
              ) : (
                "Incomplete year, so not compared with the annual mean."
              )
            ) : (
              `Annual comparison needs ${MIN_BASELINE_YEARS} complete baseline years.`
            )
          }
        />
      )}
      <Row
        label="Fire season"
        value={stats.peak ? `${MONTHS_LONG[stats.peak.from]} to ${MONTHS_LONG[stats.peak.to]}` : "Not enough years"}
        note={
          stats.peak
            ? `${Math.round(stats.peak.share * 100)}% of a typical year's hotspots fall in these three months.`
            : `Needs ${MIN_BASELINE_YEARS} complete years.`
        }
      />
    </dl>
  );
}
