import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { anomalyScale, ANOM, heatScale } from "../lib/color";

const anomaly = anomalyScale(0.8);
import { fmt, fmtCompact, fmtPercent } from "../lib/format";
import { MONTHS, MONTHS_LONG, type Range, type Stats } from "../lib/series";
import { useDismiss } from "../hooks/useDismiss";
import type { MonthlySeries } from "../lib/types";
import { useTourDemo } from "../tour/demo";

const pop = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};

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
 * The year label opens a grid of every year with data, coloured by its anomaly vs the mean year.
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
  pinned = null,
  onPin,
  aside,
}: {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  year: number;
  hoverMonth: number | null;
  onYear: (year: number) => void;
  onHover: (month: number | null) => void;
  /** The month pinned on the map (click a month to pin it, click it again to unpin). */
  pinned?: number | null;
  onPin?: (month: number) => void;
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

  const [picking, setPicking] = useState(false);
  const pickerRef = useDismiss(picking, () => setPicking(false));
  useTourDemo("year", setPicking);
  const yearButton = useRef<HTMLButtonElement>(null);
  const yearGrid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (picking) yearGrid.current?.querySelector<HTMLButtonElement>(`[data-year="${shown}"]`)?.focus();
  }, [picking]);
  const jump = (target: number | undefined) => {
    if (target !== undefined) onYear(target);
  };

  return (
    <div>
      <div ref={pickerRef} className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
            onClick={() => jump(years[at - 1])}
            disabled={at <= 0}
            aria-label="Previous year"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button
            ref={yearButton}
            className="num min-w-12 rounded-md px-1 py-1 text-center text-base font-semibold hover:bg-surface-2"
            aria-haspopup="dialog"
            aria-expanded={picking}
            aria-label={`${shown}, choose a year`}
            aria-live="polite"
            onClick={() => setPicking(!picking)}
            onKeyDown={(e) => {
              const target =
                e.key === "ArrowLeft"
                  ? years[at - 1]
                  : e.key === "ArrowRight"
                    ? years[at + 1]
                    : e.key === "Home"
                      ? years[0]
                      : e.key === "End"
                        ? years.at(-1)
                        : undefined;
              if (target !== undefined) {
                e.preventDefault();
                jump(target);
              }
            }}
          >
            {shown}
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
            onClick={() => jump(years[at + 1])}
            disabled={at < 0 || at >= years.length - 1}
            aria-label="Next year"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        {aside}
        <AnimatePresence>
          {picking && (
            <motion.div
              {...pop}
              role="dialog"
              data-tour="year-picker"
              aria-label="Choose a year"
              className="absolute inset-x-0 top-full z-30 mt-2 origin-top rounded-xl border border-border bg-surface p-2.5 shadow-2xl shadow-black/60"
            >
              <div
                ref={yearGrid}
                role="grid"
                aria-label="Years"
                className="grid grid-cols-5 gap-1"
                onKeyDown={(e) => {
                  const tile = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-year]");
                  if (!tile) return;
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setPicking(false);
                    yearButton.current?.focus();
                    return;
                  }
                  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 }[e.key];
                  if (delta === undefined) return;
                  e.preventDefault();
                  const i = years.indexOf(Number(tile.dataset.year));
                  const target = years[Math.max(0, Math.min(years.length - 1, i + delta))];
                  yearGrid.current?.querySelector<HTMLButtonElement>(`[data-year="${target}"]`)?.focus();
                }}
              >
                {years.map((y) => {
                  const yearTotal = stats.yearTotals.get(y) ?? null;
                  const rel = yearTotal !== null && stats.meanYear ? yearTotal / stats.meanYear - 1 : null;
                  const fill = rel !== null ? anomaly(rel) : undefined;
                  const dark = fill !== undefined && luminance(fill) > 0.35;
                  const inBaseline = stats.baselineYears.includes(y);
                  const yearSoFar =
                    yearTotal === null
                      ? series.values
                          .slice((y - series.startYear) * 12, (y - series.startYear) * 12 + 12)
                          .reduce<number>((a, v) => a + (v ?? 0), 0)
                      : 0;
                  const label =
                    yearTotal === null
                      ? `${y}: incomplete (${fmt(yearSoFar)} hotspots so far)`
                      : rel !== null
                        ? `${y}: ${fmt(yearTotal)} hotspots, ${fmtPercent(rel)} vs mean`
                        : `${y}: ${fmt(yearTotal)} hotspots`;
                  return (
                    <button
                      key={y}
                      data-year={y}
                      role="gridcell"
                      aria-label={label}
                      title={label}
                      onClick={() => {
                        onYear(y);
                        setPicking(false);
                      }}
                      className={`num h-8 rounded-md text-xs font-medium ${
                        yearTotal === null
                          ? "border border-dashed border-muted text-muted"
                          : fill === undefined
                            ? "bg-surface-2 text-text"
                            : dark
                              ? "text-bg"
                              : "text-text/90"
                      } ${y === shown ? "ring-2 ring-nasa-red" : ""}`}
                      style={{ background: fill, opacity: rel !== null && !inBaseline ? 0.35 : 1 }}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
                {stats.meanYear !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    Below
                    <span
                      className="h-2 w-10 rounded-sm"
                      style={{ background: `linear-gradient(90deg, ${ANOM.join(",")})` }}
                      aria-hidden
                    />
                    Above average
                  </span>
                )}
                {years.some((y) => stats.yearTotals.get(y) == null) && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-[3px] border border-dashed border-muted" aria-hidden />
                    Incomplete
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
              aria-pressed={onPin ? pinned === index : undefined}
              disabled={value === null}
              onClick={() => onPin?.(index)}
              onMouseEnter={() => onHover(value === null ? null : index)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(value === null ? null : index)}
              onBlur={() => onHover(null)}
              className={`h-10 rounded-lg text-xs font-medium transition-[opacity,box-shadow] duration-200 ${
                value === null ? "border border-dashed border-border text-muted" : dark ? "text-bg" : "text-text/90"
              } ${pinned === index ? "ring-2 ring-accent" : hoverMonth === index ? "ring-2 ring-text" : ""} ${partial ? "outline-dashed outline-1 -outline-offset-2 outline-[#9AA6C0]" : ""}`}
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
                {pinned === base + m && (
                  <Pin size={11} className="mr-1 inline -translate-y-px text-accent" aria-label="Pinned" />
                )}
                <span className="text-text">{MONTHS_LONG[m]}</span>{" "}
                {v == null ? "no source data" : `${fmtCompact(Math.round(v))} hotspots`}
                {rel !== null && <span style={{ color: anomaly(rel) }}> · {fmtPercent(rel)} vs typical</span>}
              </>
            );
          }
          const yearRel = total !== null && stats.meanYear ? total / stats.meanYear - 1 : null;
          return (
            <>
              <span className="text-text">{fmtCompact(Math.round(total ?? soFar))}</span>
              {" hotspots"}
              {total === null && " so far"}
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
