import { useMemo } from "react";
import { ALERT, fireflyScale, GRID, MUTED, TEXT } from "../lib/color";
import { fmt } from "../lib/format";
import { MONTHS, MONTHS_LONG, type Range, type Stats } from "../lib/shared";
import type { MonthlySeries } from "../types";

interface Props {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  focusYear: number | null;
  focusMonth: number | null;
  onFocus: (year: number, month: number, ym: string) => void;
}

const W = 400;
const LABEL = 36;
const GAP = 2;
const TOP = 16;
const COL = (W - LABEL) / 12;
const ROW = 15;

/** Years × months heatmap of the active series (Firefly ramp). */
export function Calendar({ series, stats, range, focusYear, focusMonth, onFocus }: Props) {
  const years = stats.years;
  const height = TOP + years.length * ROW + 6;

  const color = useMemo(() => {
    const usable = series.values.filter((v): v is number => v !== null);
    return fireflyScale(Math.max(1, ...usable));
  }, [series]);

  const viirsRow = years.includes(2011) && years.includes(2012) ? years.indexOf(2012) : null;
  const base = series.baselineFrom;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" role="grid"
        aria-label="Hotspots by year and month">
        <defs>
          <pattern id="partial" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke={ALERT} strokeWidth="1.2" />
          </pattern>
        </defs>

        {MONTHS.map((name, c) => (
          <text key={name} x={LABEL + c * COL + COL / 2} y={10} textAnchor="middle" fontSize="9" fill={MUTED}>{name[0]}</text>
        ))}

        {years.map((year, r) => {
          const y = TOP + r * ROW;
          const faded = base !== undefined && year < base;
          return (
            <g key={year} opacity={faded ? 0.4 : 1}>
              <text x={LABEL - 6} y={y + ROW - 4.5} textAnchor="end" fontSize="9.5"
                fill={year === focusYear ? TEXT : MUTED} fontWeight={year === focusYear ? 700 : 400} className="num">
                {year}
              </text>
              {MONTHS.map((_, c) => {
                const m = r * 12 + c;
                const value = series.values[m];
                const inRange = m >= range.from && m <= range.to;
                const provisional = series.provisionalFrom !== undefined && m >= series.provisionalFrom;
                const selected = year === focusYear && m === focusMonth;
                return (
                  <g key={c} className="cell" tabIndex={0} role="gridcell"
                    aria-label={`${MONTHS_LONG[c]} ${year}: ${value === null ? "no source data" : `${fmt(Math.round(value))} hotspots${series.partial[m] ? ", partial month" : ""}${provisional ? ", provisional" : ""}`}`}
                    onClick={() => onFocus(year, m, `${year}-${String(c + 1).padStart(2, "0")}`)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFocus(year, m, `${year}-${String(c + 1).padStart(2, "0")}`); } }}
                  >
                    <rect
                      x={LABEL + c * COL} y={y} width={COL - GAP} height={ROW - GAP} rx={2}
                      fill={value === null ? "none" : color(value)}
                      stroke={value === null ? GRID : selected ? TEXT : "none"}
                      strokeWidth={selected ? 1.6 : 0.8}
                      opacity={inRange ? 1 : 0.25}
                      className="cursor-pointer"
                    />
                    {value !== null && series.partial[m] && (
                      <rect x={LABEL + c * COL} y={y} width={COL - GAP} height={ROW - GAP} rx={2}
                        fill="url(#partial)" opacity={inRange ? 1 : 0.25} pointerEvents="none" />
                    )}
                    {provisional && <circle cx={LABEL + c * COL + 3} cy={y + 3} r={1.2} fill={MUTED} pointerEvents="none" />}
                  </g>
                );
              })}
            </g>
          );
        })}

        {viirsRow !== null && (
          <g>
            <line x1={LABEL - 2} x2={W} y1={TOP + viirsRow * ROW - 1} y2={TOP + viirsRow * ROW - 1}
              stroke={MUTED} strokeWidth={0.8} strokeDasharray="3 2" />
            <text x={W} y={TOP + viirsRow * ROW - 3.5} textAnchor="end" fontSize="7.5" fill={MUTED}>VIIRS joins (2012)</text>
          </g>
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted">
        <span>No hotspots</span>
        <svg viewBox="0 0 120 8" className="h-2 w-24" aria-hidden>
          <defs>
            <linearGradient id="firefly-legend" x1="0" x2="1">
              <stop offset="0" stopColor="#111C35" /><stop offset="0.25" stopColor="#6B1D1B" />
              <stop offset="0.5" stopColor="#E43700" /><stop offset="0.75" stopColor="#FF8A00" />
              <stop offset="1" stopColor="#FFE66D" />
            </linearGradient>
          </defs>
          <rect width="120" height="8" rx="2" fill="url(#firefly-legend)" />
        </svg>
        <span>Extreme</span>
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
          <svg width="12" height="12" aria-hidden><circle cx="4" cy="4" r="1.5" fill={MUTED} /></svg>
          Provisional
        </span>
      </div>
    </div>
  );
}
