import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { anomalyScale } from "../lib/color";
import { fmtCompact, fmtPercent } from "../lib/format";
import { labelOf, MONTHS } from "../lib/series";
import type { Explorer } from "../state";
import { YearCalendar } from "./YearCalendar";

const anomaly = anomalyScale(0.8);

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted">{label}</dt>
      <dd className="num truncate text-sm font-semibold" style={{ color }}>
        {value}
      </dd>
    </div>
  );
}

/** The map's floating "Calendar" card (collapsible): three numbers and one year of months. Everything else is behind Details. */
export function Summary({
  explorer,
  showingRecent,
  onDetails,
}: {
  explorer: Explorer;
  showingRecent: boolean;
  onDetails: () => void;
}) {
  const { series, stats, range, focus } = explorer;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("summary:collapsed") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("summary:collapsed", collapsed ? "1" : "0");
    } catch {
      /* Keep the in-memory state. */
    }
  }, [collapsed]);
  const ready = explorer.status.kind === "ready" && series && stats && range;
  const total = focus !== null && stats ? (stats.yearTotals.get(focus) ?? null) : null;
  const rel = total !== null && stats?.meanYear ? total / stats.meanYear - 1 : null;

  return (
    <div className="w-[19rem] rounded-xl border border-border bg-bg/85 p-3 shadow-2xl shadow-black/40 backdrop-blur-md">
      <button
        className="-m-1 flex w-[calc(100%+0.5rem)] items-center justify-between rounded-lg p-1 text-left hover:bg-surface-2/60"
        aria-expanded={!collapsed}
        aria-controls="summary-body"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays size={16} className="text-accent" aria-hidden /> Calendar
        </span>
        <ChevronDown
          size={16}
          className={`text-muted transition-transform ${collapsed ? "-rotate-90" : ""}`}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            id="summary-body"
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {explorer.status.kind === "loading" && (
              <div className="mt-3 h-56 animate-pulse rounded-lg bg-surface-2/70" aria-hidden />
            )}
            {explorer.status.kind === "error" && (
              <p className="mt-2 text-xs text-nasa-red" role="alert">
                {explorer.status.message}
              </p>
            )}
            {explorer.status.kind === "ready" && !series && (
              <p className="mt-2 text-xs text-muted" role="status">
                No history inside this area. Open Details for why.
              </p>
            )}

            {ready && (
              <>
                <dl className="mt-2 grid grid-cols-3 gap-2">
                  <Stat
                    label={`${labelOf(series.startYear, range.from).slice(-4)}–${labelOf(series.startYear, range.to).slice(-4)}`}
                    value={stats.rangeMonths ? fmtCompact(Math.round(stats.rangeTotal)) : "No data"}
                  />
                  <Stat
                    label="Fire season"
                    value={stats.peak ? `${MONTHS[stats.peak.from]}–${MONTHS[stats.peak.to]}` : "n/a"}
                  />
                  <Stat
                    label={focus !== null ? `${focus} vs mean` : "Year vs mean"}
                    value={rel !== null ? fmtPercent(rel) : total === null && focus !== null ? "In progress" : "n/a"}
                    color={rel !== null ? anomaly(rel) : undefined}
                  />
                </dl>
                <div className="mt-3">
                  <YearCalendar
                    series={series}
                    stats={stats}
                    range={range}
                    year={focus ?? stats.years.at(-1)!}
                    hoverMonth={explorer.hoverMonth}
                    onYear={explorer.setFocusYear}
                    onHover={showingRecent ? () => {} : explorer.setHoverMonth}
                  />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-surface-2 px-3 py-2 text-sm font-semibold text-accent hover:bg-surface-2/70"
        onClick={onDetails}
      >
        Details &amp; stats <ChevronRight size={15} aria-hidden />
      </button>
    </div>
  );
}
