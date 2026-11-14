import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { fmtTick, TICK, thinBy } from "../lib/chart";
import { ALERT, GRID, MUTED, SERIES_COLOR, TEXT } from "../lib/color";
import { fmt } from "../lib/format";
import { seasonalBand } from "../lib/seasonal";
import { MIN_BASELINE_YEARS, MONTHS, type Stats } from "../lib/shared";
import { useWidth } from "../hooks/useWidth";
import type { MonthlySeries, SeriesKind } from "../types";

interface Props {
  series: MonthlySeries;
  stats: Stats;
  focusYear: number | null;
  focusMonth: number | null; // month index
  minYear: number;
  maxYear: number;
  onFocusYear: (year: number) => void;
  onFocusMonth: (month: number, ym: string) => void;
}

const H = 200;
const PAD_L = 40;
const PAD_B = 22;
const PAD_T = 10;

export function SeasonalCurve({ series, stats, focusYear, focusMonth, minYear, maxYear, onFocusYear, onFocusMonth }: Props) {
  const { ref, width } = useWidth();
  const svg = useRef<SVGSVGElement>(null);
  const band = seasonalBand(series, stats, focusYear);

  const innerW = Math.max(width - PAD_L - 8, 1);
  const innerH = H - PAD_T - PAD_B;
  const x = (m: number) => PAD_L + (m / 11) * innerW;
  const slot = innerW / 11;
  const step = thinBy(slot, 30);

  const max = Math.max(1, ...band.flatMap((p) => [p.value ?? 0, p.p90 ?? 0]));
  const y = (v: number) => PAD_T + innerH - (v / max) * innerH;
  const kind: SeriesKind = series.kind ?? "HARMONIZED";
  const color = SERIES_COLOR[kind];

  const withBand = band.filter((p) => p.p10 !== null);
  const bandPath = withBand.length
    ? withBand.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(2)},${y(p.p10!).toFixed(2)}`).join("")
      + [...withBand].reverse().map((p) => `L${x(p.month).toFixed(2)},${y(p.p90!).toFixed(2)}`).join("") + "Z"
    : "";
  const medianPath = withBand.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(2)},${y(p.p50!).toFixed(2)}`).join("");

  const own = band.filter((p) => p.value !== null);
  const firstProv = own.findIndex((p) => p.provisional);
  const provisional = firstProv >= 0 ? own.slice(Math.max(0, firstProv - 1)) : [];
  const line = (pts: typeof own) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(2)},${y(p.value!).toFixed(2)}`).join("");

  const focusIdx = focusYear !== null && focusMonth !== null
    ? focusMonth - (focusYear - series.startYear) * 12 : null;

  function monthAt(event: React.PointerEvent): number | null {
    const box = svg.current!.getBoundingClientRect();
    const px = event.clientX - box.left - PAD_L;
    const m = Math.round((px / innerW) * 11);
    return m >= 0 && m < 12 && focusYear !== null ? m : null;
  }
  const pick = (m: number) => {
    const idx = (focusYear! - series.startYear) * 12 + m;
    onFocusMonth(idx, `${focusYear}-${String(m + 1).padStart(2, "0")}`);
  };

  function onKey(event: React.KeyboardEvent) {
    if (focusYear === null || focusMonth === null) return;
    const next = event.key === "ArrowLeft" ? focusMonth - 1 : event.key === "ArrowRight" ? focusMonth + 1 : null;
    if (next === null) return;
    const year = series.startYear + Math.floor(next / 12);
    if (next >= 0 && next < series.values.length && series.values[next] !== null) {
      event.preventDefault();
      if (year !== focusYear) onFocusYear(year);
      onFocusMonth(next, `${year}-${String((next % 12) + 1).padStart(2, "0")}`);
    }
  }

  return (
    <div ref={ref}>
      <div className="mb-2 flex items-center justify-between">
        <button className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-bg hover:text-text disabled:opacity-30"
          disabled={focusYear === null || focusYear <= minYear} onClick={() => onFocusYear(focusYear! - 1)} aria-label="Previous year">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span className="num text-sm font-semibold">{focusYear ?? "—"}</span>
        <button className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-bg hover:text-text disabled:opacity-30"
          disabled={focusYear === null || focusYear >= maxYear} onClick={() => onFocusYear(focusYear! + 1)} aria-label="Next year">
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      {width > 0 && (
        <svg
          ref={svg} viewBox={`0 0 ${width} ${H}`} width={width} height={H} className="block cursor-crosshair" role="img" tabIndex={0}
          aria-label={`Monthly hotspots for ${focusYear ?? "—"} against the baseline p10 to p90 band`}
          onKeyDown={onKey}
          onPointerDown={(e) => { const m = monthAt(e); if (m !== null) pick(m); }}
          onPointerMove={(e) => { if (e.buttons === 1) { const m = monthAt(e); if (m !== null && m !== focusIdx) pick(m); } }}
        >
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={width} y1={y(max * t)} y2={y(max * t)} stroke={GRID} />
              <text x={PAD_L - 6} y={y(max * t) + 3.5} textAnchor="end" fontSize={TICK.size} fill={TICK.fill}>
                {fmtTick(Math.round(max * t))}
              </text>
            </g>
          ))}
          {MONTHS.map((name, m) => (
            m % step === 0 && (
              <text key={name} x={x(m)} y={H - 6} textAnchor="middle" fontSize={TICK.size} fill={TICK.fill}>
                {step > 1 ? name : name[0]}
              </text>
            )
          ))}

          {bandPath && <path d={bandPath} fill="#38BDF8" fillOpacity={0.14} />}
          {medianPath && <path d={medianPath} fill="none" stroke={MUTED} strokeWidth={1} strokeDasharray="4 3" />}
          {line(own) && <path d={line(own)} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />}
          {provisional.length > 0 && <path d={line(provisional)} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="3 3" strokeLinejoin="round" />}

          {band.map((p) => {
            if (p.value === null) return null;
            const high = p.p90 !== null && p.value > p.p90;
            const low = p.p10 !== null && p.value < p.p10;
            const active = p.month === focusIdx;
            return (
              <circle
                key={p.month} cx={x(p.month)} cy={y(p.value)} r={active ? 4 : 2.6}
                fill={p.partial ? "none" : high ? "#FF8A00" : low ? "#60A5FA" : color}
                stroke={p.partial ? ALERT : active ? TEXT : "none"}
                strokeWidth={1.4}
              >
                <title>{`${MONTHS[p.month]} ${focusYear}: ${fmt(Math.round(p.value))} hotspots${p.partial ? " (partial month)" : ""}${p.provisional ? " (provisional)" : ""}`}</title>
              </circle>
            );
          })}
          {focusIdx !== null && focusIdx >= 0 && (
            <line x1={x(focusIdx)} x2={x(focusIdx)} y1={PAD_T} y2={H - PAD_B} stroke={TEXT} strokeOpacity={0.55} />
          )}
        </svg>
      )}

      {withBand.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-sm" style={{ background: "#38BDF8", opacity: 0.3 }} /> p10–p90 of baseline years
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t border-dashed" style={{ borderColor: MUTED }} /> median
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: color }} /> {focusYear}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full border" style={{ borderColor: ALERT }} /> partial
          </span>
          {provisional.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0 w-4 border-t border-dashed" style={{ borderColor: color }} /> provisional
            </span>
          )}
        </div>
      ) : (
        <p className="mt-2 rounded-lg border border-dashed border-grid p-3 text-xs text-muted">
          The comparison band needs {MIN_BASELINE_YEARS} other complete years. This selection is too short —
          the {focusYear} line still shows its own months.
        </p>
      )}
    </div>
  );
}
