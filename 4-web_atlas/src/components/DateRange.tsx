import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { labelOf, MONTHS, MONTHS_LONG, type Range } from "../lib/series";

interface Props {
  startYear: number;
  bounds: Range; // months the series has data for
  range: Range;
  baselineFrom?: number;
  focusYear: number | null;
  onRange: (range: Range) => void;
}

const pop = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};

export function DateRange({ startYear, bounds, range, baselineFrom, focusYear, onRange }: Props) {
  const lastYear = startYear + Math.floor(bounds.to / 12);
  const yearStart = (y: number) => Math.max(bounds.from, (y - startYear) * 12);
  const yearEnd = (y: number) => Math.min(bounds.to, (y - startYear) * 12 + 11);

  const presets: { label: string; range: Range }[] = [
    { label: "All", range: bounds },
    { label: "Last 10 years", range: { from: yearStart(lastYear - 9), to: bounds.to } },
    { label: "Last 5 years", range: { from: yearStart(lastYear - 4), to: bounds.to } },
  ];
  if (baselineFrom && yearStart(baselineFrom) > bounds.from) {
    presets.push({ label: `Since ${baselineFrom}`, range: { from: yearStart(baselineFrom), to: bounds.to } });
  }
  if (focusYear !== null && yearStart(focusYear) <= yearEnd(focusYear)) {
    presets.push({ label: String(focusYear), range: { from: yearStart(focusYear), to: yearEnd(focusYear) } });
  }
  const same = (a: Range, b: Range) => a.from === b.from && a.to === b.to;
  const months = range.to - range.from + 1;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <MonthField
          label="From"
          startYear={startYear}
          value={range.from}
          min={bounds.from}
          max={range.to}
          onChange={(m) => onRange({ from: m, to: range.to })}
        />
        <ArrowRight size={16} className="mb-3 shrink-0 text-muted" aria-hidden />
        <MonthField
          label="To"
          startYear={startYear}
          value={range.to}
          min={range.from}
          max={bounds.to}
          align="right"
          onChange={(m) => onRange({ from: range.from, to: m })}
        />
        <button
          className="btn !min-h-10 !px-3"
          onClick={() => onRange(bounds)}
          disabled={same(range, bounds)}
          aria-label="Show all dates"
          title="Show all dates"
        >
          <RotateCcw size={15} aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick date ranges">
        {presets.map((p) => {
          const active = same(p.range, range);
          return (
            <button
              key={p.label}
              onClick={() => onRange(p.range)}
              aria-pressed={active}
              className={`num min-h-11 min-w-11 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-accent bg-accent/15 text-text"
                  : "border-border text-muted hover:border-muted hover:text-text"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <span className="num ml-auto text-2xs text-muted">
          {months} month{months === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  startYear: number;
  value: number;
  min: number;
  max: number;
  align?: "left" | "right";
  onChange: (month: number) => void;
}

/** A month button that opens a year stepper and month grid; months outside [min, max] are disabled. */
function MonthField({ label, startYear, value, min, max, align = "left", onChange }: FieldProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"months" | "years">("months");
  const [year, setYear] = useState(startYear + Math.floor(value / 12));
  const ref = useDismiss(open, () => setOpen(false));
  const minYear = startYear + Math.floor(min / 12);
  const maxYear = startYear + Math.floor(max / 12);
  const index = (y: number, m: number) => (y - startYear) * 12 + m;

  const toggle = () => {
    setYear(startYear + Math.floor(value / 12));
    setView("months");
    setOpen(!open);
  };
  const pick = (m: number) => {
    onChange(m);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <span className="mb-1 block text-xs text-muted" id={`${label}-label`}>
        {label}
      </span>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${label}-label ${label}-value`}
        className={`field num flex items-center justify-between gap-2 text-left ${open ? "!border-accent" : ""}`}
      >
        <span id={`${label}-value`}>{labelOf(startYear, value)}</span>
        <CalendarDays size={15} className="shrink-0 text-muted" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            {...pop}
            role="dialog"
            aria-label={`${label} month`}
            className={`absolute top-full z-30 mt-2 w-64 rounded-xl border border-border bg-surface p-3 shadow-2xl shadow-black/60 ${align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className={`grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30 ${view === "years" ? "invisible" : ""}`}
                disabled={year <= minYear}
                onClick={() => setYear(year - 1)}
                aria-label="Previous year"
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="num rounded-lg px-3 py-1 text-sm font-semibold hover:bg-surface-2"
                onClick={() => setView(view === "months" ? "years" : "months")}
                aria-label={view === "months" ? `${year}, choose another year` : "Back to months"}
              >
                {view === "months" ? year : `${minYear}–${maxYear}`}
              </button>
              <button
                type="button"
                className={`grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30 ${view === "years" ? "invisible" : ""}`}
                disabled={year >= maxYear}
                onClick={() => setYear(year + 1)}
                aria-label="Next year"
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view === "months" ? `m${year}` : "years"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className={`grid gap-1 ${view === "months" ? "grid-cols-4" : "grid-cols-5"}`}
              >
                {view === "months"
                  ? MONTHS.map((name, m) => {
                      const i = index(year, m);
                      const disabled = i < min || i > max;
                      const selected = i === value;
                      return (
                        <button
                          key={name}
                          type="button"
                          disabled={disabled}
                          onClick={() => pick(i)}
                          aria-pressed={selected}
                          aria-label={`${MONTHS_LONG[m]} ${year}`}
                          title={
                            disabled
                              ? i < min
                                ? `Before ${labelOf(startYear, min)}`
                                : `After ${labelOf(startYear, max)}`
                              : undefined
                          }
                          className={`h-9 rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:text-muted/35 ${
                            selected ? "bg-accent font-semibold text-[#06102A]" : "hover:bg-surface-2 enabled:text-text"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })
                  : Array.from({ length: maxYear - minYear + 1 }, (_, k) => minYear + k).map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setYear(y);
                          setView("months");
                        }}
                        className={`num h-8 rounded-lg text-sm hover:bg-surface-2 ${y === year ? "ring-1 ring-accent" : ""}`}
                      >
                        {y}
                      </button>
                    ))}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
