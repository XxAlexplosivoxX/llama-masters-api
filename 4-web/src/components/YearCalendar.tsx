import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { anomalyScale, heatScale } from "../lib/color";

const anomaly = anomalyScale(0.8);
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
  aside,
}: {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  year: number;
  hoverMonth: number | null;
  onYear: (year: number) => void;
  onHover: (month: number | null) => void;
  /** Shown at the right of the year row (the Details button). */
  aside?: ReactNode;
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
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
            onClick={() => onYear(years[at - 1])}
            disabled={at <= 0}
            aria-label="Previous year"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="num w-12 text-center text-base font-semibold" aria-live="polite">
            {shown}
          </span>
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
            onClick={() => onYear(years[at + 1])}
            disabled={at < 0 || at >= years.length - 1}
            aria-label="Next year"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        {aside}
      </div>

      <div className="mt-2.5 grid grid-cols-4 gap-1.5" role="grid" aria-label={`Hotspots by month in ${shown}`}>
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
              onMouseEnter={() => onHover(value === null ? null : index)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(value === null ? null : index)}
              onBlur={() => onHover(null)}
              className={`h-10 rounded-lg text-xs font-medium transition-[opacity,box-shadow] duration-200 ${
                value === null ? "border border-dashed border-border text-muted" : dark ? "text-bg" : "text-text/90"
              } ${hoverMonth === index ? "ring-2 ring-text" : ""} ${partial ? "outline-dashed outline-1 -outline-offset-2 outline-[#9AA6C0]" : ""}`}
              style={{ background: fill, opacity: inRange ? 1 : 0.35 }}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* One line: the hovered month, otherwise the year against the mean and the fire season. */}
      <p className="num mt-2.5 h-4 truncate text-xs text-muted" aria-live="polite">
        {(() => {
          const m = hoverMonth !== null && hoverMonth >= base && hoverMonth < base + 12 ? hoverMonth - base : null;
          if (m !== null) {
            const v = series.values[base + m];
            const clim = stats.climatology[m];
            const rel = v != null && !series.partial[base + m] && clim ? v / clim - 1 : null;
            return (
              <>
                <span className="text-text">{MONTHS_LONG[m]}</span>{" "}
                {v == null ? "no source data" : `${fmtCompact(Math.round(v))} hotspots`}
                {rel !== null && <span style={{ color: anomaly(rel) }}> · {fmtPercent(rel)} vs typical</span>}
              </>
            );
          }
          const yearRel = total !== null && stats.meanYear ? total / stats.meanYear - 1 : null;
          return (
            <>
              <span className="text-text">
                {total !== null ? fmtCompact(Math.round(total)) : `${fmtCompact(Math.round(soFar))} so far`}
              </span>
              {" hotspots"}
              {yearRel !== null && " · "}
              {yearRel !== null && <span style={{ color: anomaly(yearRel) }}>{fmtPercent(yearRel)} vs mean</span>}
            </>
          );
        })()}
      </p>
      {stats.peak && (
        <p className="mt-0.5 text-xs text-muted">
          Fire season {MONTHS[stats.peak.from]}–{MONTHS[stats.peak.to]}
        </p>
      )}
    </div>
  );
}
