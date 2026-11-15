import { CalendarDays, ChartColumn, ChevronDown } from "lucide-react";
import type { Explorer } from "../state";
import { YearCalendar } from "./YearCalendar";

/** The toolbar's Calendar button: opens the card below the toolbar. */
export function CalendarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="seg">
      <button aria-pressed={open} aria-expanded={open} aria-controls="calendar-card" onClick={onToggle}>
        <CalendarDays size={16} className="text-accent" aria-hidden />
        Calendar
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
    </div>
  );
}

/** The Calendar card under the toolbar: one year of months and one line of context. Everything else is behind Details. */
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
  const ready = explorer.status.kind === "ready" && series && stats && range;
  const details = (
    <button
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
      onClick={onDetails}
    >
      <ChartColumn size={14} className="text-accent" aria-hidden />
      Details
    </button>
  );

  return (
    <div
      id="calendar-card"
      className="w-72 rounded-xl border border-border bg-bg/85 p-3.5 shadow-2xl shadow-black/40 backdrop-blur-md"
    >
      {explorer.status.kind === "loading" && (
        <div className="mt-3 h-40 animate-pulse rounded-lg bg-surface-2/70" aria-hidden />
      )}
      {explorer.status.kind === "error" && (
        <p className="mt-2 text-xs text-nasa-red" role="alert">
          {explorer.status.message}
        </p>
      )}
      {explorer.status.kind === "ready" && !series && (
        <p className="mt-2 text-xs text-muted" role="status">
          {explorer.isGlobal && !explorer.loaded
            ? "Click countries on the map or draw an area to see their calendar."
            : "No history inside this area. Open Details for why."}
        </p>
      )}

      {ready && (
        <>
          <div>
            <YearCalendar
              series={series}
              stats={stats}
              range={range}
              year={focus ?? stats.years.at(-1)!}
              hoverMonth={explorer.hoverMonth}
              onYear={explorer.setFocusYear}
              onHover={showingRecent ? () => {} : explorer.setHoverMonth}
              pinned={showingRecent ? null : explorer.pinnedMonth}
              onPin={showingRecent ? undefined : explorer.togglePin}
              aside={details}
            />
          </div>
        </>
      )}
      {!ready && <div className="mt-2 flex justify-end">{details}</div>}
    </div>
  );
}
