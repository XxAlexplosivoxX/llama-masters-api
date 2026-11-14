import { useMemo, useState } from "react";
import { AXIS, TICK, thinBy } from "../lib/chart";
import { ALERT, ANOM, anomalyScale, BG, fireflyScale, GRID, MUTED, TEXT } from "../lib/color";
import { fmt, fmtCompact, fmtPercent } from "../lib/format";
import { percentile } from "../lib/seasonal";
import { Ramp } from "./Ramp";
import { MONTHS, MONTHS_LONG, type Range, type Stats } from "../lib/shared";
import { useWidth } from "../hooks/useWidth";
import { CALENDAR_EXPORT } from "./ExportMenu";
import type { MonthlySeries } from "../types";

interface Props {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  focusYear: number | null;
  focusMonth: number | null;
  onFocus: (year: number, month: number, ym: string) => void;
}

const LABEL = 40;
const GAP = 2;
const TOP = 20;
const ROW = 26; // ≥24 px rows so cells are comfortable touch targets
const LIMIT = 0.8; // anomaly colours saturate at ±80 %
const anomalyColor = anomalyScale(LIMIT);
type Mode = "counts" | "anomaly";

/** Years × months heatmap of the active series (Firefly ramp). */
export function Calendar({ series, stats, range, focusYear, focusMonth, onFocus }: Props) {
  const { ref, width } = useWidth();
  const years = stats.years;
  const COL = Math.max((width - LABEL) / 12, 1);
  const height = TOP + years.length * ROW + 6;
  const step = thinBy(COL, 14);
  const [mode, setMode] = useState<Mode>("counts");

  const { color, max, median } = useMemo(() => {
    const usable = series.values.filter((v): v is number => v !== null);
    const max = Math.max(1, ...usable);
    const positive = usable.filter((v) => v > 0).sort((a, b) => a - b);
    return { color: fireflyScale(max), max, median: positive.length ? percentile(positive, 0.5) : null };
  }, [series]);

  const viirsRow = years.includes(2011) && years.includes(2012) ? years.indexOf(2012) : null;
  const base = series.baselineFrom;

  /** value / baseline mean of that calendar month − 1; null whenever the month must not be compared. */
  const anomalyOf = (m: number, year: number): number | null => {
    const value = series.values[m];
    const clim = stats.climatology[m % 12];
    const provisional = series.provisionalFrom !== undefined && m >= series.provisionalFrom;
    if (value === null || series.partial[m] || provisional || clim === null || clim <= 0) return null;
    if (base !== undefined && year < base) return null;
    return value / clim - 1;
  };
  const hasClimatology = stats.climatology.some((c) => c !== null);

  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="seg" role="group" aria-label="Calendar colour">
          {(["counts", "anomaly"] as const).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}
              disabled={m === "anomaly" && !hasClimatology}
              className={`disabled:opacity-40 ${mode === m ? "bg-slate-800" : ""}`}>
              {m === "counts" ? "Counts" : "Anomaly"}
            </button>
          ))}
        </div>
        {mode === "anomaly" && (
          <p className="text-xs text-muted">vs the {base ? `${base}+ ` : ""}baseline mean of each calendar month · + / − marks ±25 % or more</p>
        )}
      </div>
      <div className="max-h-[32rem] overflow-y-auto">
      {width > 0 && (
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block" role="grid" {...{ [CALENDAR_EXPORT]: "" }}
          aria-label="Hotspots by year and month">
          <defs>
            <pattern id="partial" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={ALERT} strokeWidth="1.2" />
            </pattern>
          </defs>

          {MONTHS.map((name, c) => (
            c % step === 0 && (
              <text key={name} x={LABEL + c * COL + COL / 2} y={13} textAnchor="middle" fontSize={TICK.size} fill={TICK.fill}>
                {step > 2 ? name : name[0]}
              </text>
            )
          ))}

          {years.map((year, r) => {
            const y = TOP + r * ROW;
            const faded = base !== undefined && year < base;
            return (
              <g key={year} opacity={faded ? 0.4 : 1}>
                <text x={LABEL - 6} y={y + ROW - 5} textAnchor="end" fontSize={AXIS.size}
                  fill={year === focusYear ? TEXT : MUTED} fontWeight={year === focusYear ? 700 : 400} className="num">
                  {year}
                </text>
                {MONTHS.map((_, c) => {
                  const m = r * 12 + c;
                  const value = series.values[m];
                  const inRange = m >= range.from && m <= range.to;
                  const provisional = series.provisionalFrom !== undefined && m >= series.provisionalFrom;
                  const selected = year === focusYear && m === focusMonth;
                  const anom = mode === "anomaly" ? anomalyOf(m, year) : null;
                  const notCompared = mode === "anomaly" && value !== null && anom === null;
                  const fill = value === null ? "none" : mode === "counts" ? color(value) : anom === null ? GRID : anomalyColor(anom);
                  const status = value === null ? "no source data" : `${fmt(Math.round(value))} hotspots${series.partial[m] ? ", partial month" : ""}${provisional ? ", provisional" : ""}`;
                  const anomText = mode !== "anomaly" || value === null ? ""
                    : anom !== null ? `, ${fmtPercent(anom)} vs baseline mean` : ", not compared";
                  return (
                    <g key={c} className="cell" tabIndex={0} role="gridcell"
                      aria-label={`${MONTHS_LONG[c]} ${year}: ${status}${anomText}`}
                      onClick={() => onFocus(year, m, `${year}-${String(c + 1).padStart(2, "0")}`)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFocus(year, m, `${year}-${String(c + 1).padStart(2, "0")}`); } }}
                    >
                      <rect
                        x={LABEL + c * COL} y={y} width={Math.max(COL - GAP, 1)} height={ROW - GAP} rx={2}
                        fill={fill}
                        stroke={value === null ? GRID : selected ? TEXT : "none"}
                        strokeWidth={selected ? 1.6 : 0.8}
                        opacity={inRange ? 1 : 0.25}
                        className="cursor-pointer"
                      />
                      {value !== null && series.partial[m] && (
                        <rect x={LABEL + c * COL} y={y} width={Math.max(COL - GAP, 1)} height={ROW - GAP} rx={2}
                          fill="url(#partial)" opacity={inRange ? 1 : 0.25} pointerEvents="none" />
                      )}
                      {provisional && <circle cx={LABEL + c * COL + 4} cy={y + 4} r={1.8} fill={MUTED} pointerEvents="none" />}
                      {notCompared && !series.partial[m] && !provisional && (
                        <line x1={LABEL + c * COL + 4} x2={LABEL + (c + 1) * COL - GAP - 4} y1={y + (ROW - GAP) / 2} y2={y + (ROW - GAP) / 2}
                          stroke={MUTED} strokeWidth={1} pointerEvents="none" />
                      )}
                      {anom !== null && Math.abs(anom) >= 0.25 && COL >= 16 && (
                        <text x={LABEL + c * COL + (COL - GAP) / 2} y={y + (ROW - GAP) / 2 + 4} textAnchor="middle"
                          fontSize={12} fontWeight={700} fill={BG} pointerEvents="none" aria-hidden>
                          {anom > 0 ? "+" : "−"}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {viirsRow !== null && (
            <g>
              <line x1={LABEL - 2} x2={width} y1={TOP + viirsRow * ROW - 1.5} y2={TOP + viirsRow * ROW - 1.5}
                stroke={MUTED} strokeWidth={0.8} strokeDasharray="3 2" />
              <text x={LABEL + 3} y={TOP + viirsRow * ROW - 5} fontSize={TICK.size} fill={MUTED}
                stroke="#060D1E" strokeWidth={3} paintOrder="stroke">VIIRS joins (2012)</text>
            </g>
          )}
        </svg>
      )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted">
        {mode === "counts" ? (
          <Ramp
            label="Hotspots per month (square-root scale)"
            stops={Array.from({ length: 9 }, (_, i) => color(max * (i / 8) ** 2))}
            ticks={[
              { at: 0, text: "0" },
              ...(median !== null && median < max * 0.8 ? [{ at: Math.sqrt(median / max), text: `${fmtCompact(Math.round(median))} median` }] : []),
              { at: 1, text: `${fmtCompact(Math.round(max))} max` },
            ]}
          />
        ) : (
          <>
            <Ramp
              label="Anomaly vs baseline mean"
              stops={ANOM}
              ticks={[
                { at: 0, text: `${fmtPercent(-LIMIT)} or less` },
                { at: 0.5, text: "0" },
                { at: 1, text: `${fmtPercent(LIMIT)} or more` },
              ]}
            />
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="2" fill={GRID} /><line x1="2" x2="10" y1="6" y2="6" stroke={MUTED} /></svg>
              Not compared
            </span>
          </>
        )}
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="2" fill="none" stroke={GRID} /></svg>
          No data
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <rect width="12" height="12" rx="2" fill="#111C35" />
            <path d="M-2 4 L4 -2 M0 14 L14 0 M8 16 L16 8" stroke={ALERT} strokeWidth="1.5" />
          </svg>
          Partial
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden><circle cx="4" cy="4" r="1.8" fill={MUTED} /></svg>
          Provisional
        </span>
      </div>
    </div>
  );
}
