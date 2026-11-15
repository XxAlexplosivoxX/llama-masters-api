import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { heatScale } from "../lib/color";
import { fmt, fmtCompact, fmtPercent } from "../lib/format";
import { MONTHS, MONTHS_LONG, type Range, type Stats } from "../lib/series";
import type { MonthlySeries } from "../lib/types";

/** Relative luminance of a "#rrggbb" or "rgb(r, g, b)" colour, 0..1. */
function luminance(color: string): number {
  const rgb = color.startsWith("#")
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : (color.match(/\d+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * One year as a wall calendar: twelve month tiles coloured by hotspots, with arrows to change year.
 * Hovering or focusing a month shows it on the map.
 */
export function YearCalendar({
  series,
  stats,
  range,
  year,
  hoverMonth,
  onYear,
  onHover,
}: {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  year: number;
  hoverMonth: number | null;
  onYear: (year: number) => void;
  onHover: (month: number | null) => void;
}) {
  // Years with any source data (the VIIRS-only view starts in 2012).
  const years = useMemo(
    () =>
      stats.years.filter((y) =>
        series.values.slice((y - series.startYear) * 12, (y - series.startYear) * 12 + 12).some((v) => v !== null),
      ),
    [series, stats],
  );
  const color = useMemo(() => {
    const usable = series.values.filter((v, m): v is number => v !== null && !series.partial[m]);
    return heatScale(Math.max(1, ...usable));
  }, [series]);
  const shown = years.includes(year) ? year : (years.at(-1) ?? year);
  const at = years.indexOf(shown);
  const base = (shown - series.startYear) * 12;
  const total = stats.yearTotals.get(shown) ?? null;
  const soFar = series.values.slice(base, base + 12).reduce<number>((a, v) => a + (v ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
            onClick={() => onYear(years[at - 1])}
            disabled={at <= 0}
            aria-label="Previous year"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="num w-11 text-center text-sm font-semibold" aria-live="polite">
            {shown}
          </span>
          <button
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
            onClick={() => onYear(years[at + 1])}
            disabled={at < 0 || at >= years.length - 1}
            aria-label="Next year"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <span className="num text-xs text-muted">
          {total !== null ? `${fmtCompact(Math.round(total))} hotspots` : `${fmtCompact(Math.round(soFar))} so far`}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5" role="grid" aria-label={`Hotspots by month in ${shown}`}>
        {MONTHS.map((name, m) => {
          const index = base + m;
          const value = series.values[index] ?? null;
          const partial = series.partial[index];
          const clim = stats.climatology[m];
          const fill = value === null ? undefined : color(value);
          const dark = fill !== undefined && luminance(fill) > 0.35;
          const inRange = index >= range.from && index <= range.to;
          const rel = value !== null && !partial && clim ? value / clim - 1 : null;
          const label = `${MONTHS_LONG[m]} ${shown}: ${value === null ? "no source data" : `${fmt(value)} hotspots`}${partial ? ", partial month" : ""}${rel !== null ? `, ${fmtPercent(rel)} vs a typical ${MONTHS_LONG[m]}` : ""}`;
          return (
            <button
              key={m}
              role="gridcell"
              aria-label={label}
              title={label}
              onMouseEnter={() => onHover(value === null ? null : index)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(value === null ? null : index)}
              onBlur={() => onHover(null)}
              className={`relative flex h-14 flex-col justify-between rounded-md p-1.5 text-left transition-[opacity,box-shadow] duration-200 ${
                value === null ? "border border-dashed border-border bg-transparent" : ""
              } ${hoverMonth === index ? "ring-2 ring-text" : ""} ${partial ? "outline-dashed outline-1 -outline-offset-2 outline-[#9AA6C0]" : ""}`}
              style={{ background: fill, opacity: inRange ? 1 : 0.35 }}
            >
              <span className={`text-[11px] font-medium ${dark ? "text-bg" : "text-text/90"}`}>{name}</span>
              <span className={`num text-xs font-semibold ${dark ? "text-bg" : "text-text"}`}>
                {value === null ? "–" : fmtCompact(Math.round(value))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
