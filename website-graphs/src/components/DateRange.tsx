import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { labelOf, MONTHS, MONTHS_LONG, type Range } from "../lib/shared";
import { useKeepInView } from "../hooks/useKeepInView";

interface Props {
  startYear: number;
  bounds: Range; // months the series has data for
  range: Range;
  baselineFrom?: number;
  focusYear: number | null;
  onRange: (range: Range) => void;
  onClamped?: (bounds: Range) => void;
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return ref;
}

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
    <div className="@container space-y-2">
      <div className="flex items-end gap-2">
        <MonthField label="From" startYear={startYear} value={range.from} min={bounds.from} max={range.to}
          onChange={(m) => onRange({ from: m, to: range.to })} />
        <ArrowRight size={16} className="mb-3 shrink-0 text-muted" aria-hidden />
        <MonthField label="To" startYear={startYear} value={range.to} min={range.from} max={bounds.to} align="right"
          trailing={
            <span className="num ml-2 inline-block whitespace-nowrap rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[11px] font-normal normal-case tracking-normal text-slate-300">
              {months} months
            </span>
          }
          onChange={(m) => onRange({ from: range.from, to: m })} />
        <button
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-slate-800 hover:text-text disabled:opacity-40"
          onClick={() => onRange(bounds)} disabled={same(range, bounds)}
          aria-label="Reset filters" title="Reset filters">
          <RotateCcw size={15} aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick date ranges">
        {presets.map((p) => {
          const active = same(p.range, range);
          return (
            <button key={p.label} onClick={() => onRange(p.range)} aria-pressed={active}
              className={`num rounded-full border px-2.5 py-1 text-xs transition-colors ${active
                ? "border-[#F97316] bg-[#F97316]/15 text-text" : "border-grid text-muted hover:border-muted hover:text-text"}`}>
              {p.label}
            </button>
          );
        })}
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
  trailing?: React.ReactNode;
  onChange: (month: number) => void;
}

/** A month button that opens a year stepper and month grid; months outside [min, max] are disabled. */
function MonthField({ label, startYear, value, min, max, align = "left", trailing, onChange }: FieldProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"months" | "years">("months");
  const [year, setYear] = useState(startYear + Math.floor(value / 12));
  const ref = useDismiss(open, () => setOpen(false));
  const popover = useKeepInView(open);
  const minYear = startYear + Math.floor(min / 12);
  const maxYear = startYear + Math.floor(max / 12);
  const index = (y: number, m: number) => (y - startYear) * 12 + m;

  const toggle = () => {
    setYear(startYear + Math.floor(value / 12));
    setView("months");
    setOpen(!open);
  };
  const pick = (m: number) => { onChange(m); setOpen(false); };

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <span className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400" id={`${label}-label`}>
        {label}{trailing}
      </span>
      <button type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-labelledby={`${label}-label ${label}-value`}
        className={`field num flex w-full items-center justify-between gap-2 text-left ${open ? "!border-[#F97316]" : ""}`}>
        <span id={`${label}-value`} className="min-w-0 truncate">{labelOf(startYear, value)}</span>
        {/* Decorative; dropped on narrow toolbars so "Nov 2000" keeps one line. */}
        <CalendarDays size={15} className="hidden shrink-0 text-muted @[18rem]:block" aria-hidden />
      </button>
      {open && (
        <div ref={popover} role="dialog" aria-label={`${label} month`}
          className={`absolute top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-grid bg-card p-3 shadow-2xl shadow-black/60 ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-bg hover:text-text disabled:opacity-30"
              disabled={view === "years" || year <= minYear} onClick={() => setYear(year - 1)} aria-label="Previous year">
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button type="button" className="num rounded-lg px-3 py-1 text-sm font-semibold hover:bg-bg"
              onClick={() => setView(view === "months" ? "years" : "months")} aria-label={view === "months" ? `${year}, choose another year` : "Back to months"}>
              {view === "months" ? year : `${minYear}–${maxYear}`}
            </button>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-bg hover:text-text disabled:opacity-30"
              disabled={view === "years" || year >= maxYear} onClick={() => setYear(year + 1)} aria-label="Next year">
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div className={`grid gap-1 ${view === "months" ? "grid-cols-4" : "dark-scroll max-h-56 grid-cols-4 overflow-y-auto"}`}>
            {view === "months"
              ? MONTHS.map((name, m) => {
                const i = index(year, m);
                const disabled = i < min || i > max;
                const selected = i === value;
                return (
                  <button key={name} type="button" disabled={disabled} onClick={() => pick(i)}
                    aria-pressed={selected} aria-label={`${MONTHS_LONG[m]} ${year}`}
                    title={disabled ? (i < min ? `Before ${labelOf(startYear, min)}` : `After ${labelOf(startYear, max)}`) : undefined}
                    className={`h-9 rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:text-muted/35 ${selected
                      ? "bg-[#F97316] font-semibold text-[#1A0B00]" : "hover:bg-bg enabled:text-text"}`}>
                    {name}
                  </button>
                );
              })
              : Array.from({ length: maxYear - minYear + 1 }, (_, k) => minYear + k).map((y) => (
                <button key={y} type="button" onClick={() => { setYear(y); setView("months"); }}
                  className={`num h-9 rounded-lg text-sm hover:bg-bg ${y === year ? "ring-1 ring-[#F97316]" : ""}`}>
                  {y}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
