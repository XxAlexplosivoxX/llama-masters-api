import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { anomalyScale, heatScale, HEAT_ZERO } from "../lib/color";
import { fmt, fmtPercent } from "../lib/format";
import { MONTHS, MONTHS_LONG, type Range, type Stats } from "../lib/series";
import type { MonthlySeries } from "../lib/types";

interface Props {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  focusYear: number | null;
  hoverMonth: number | null;
  waveKey: string;
  onHover: (month: number | null) => void;
  onRange: (range: Range) => void;
  onFocusYear: (year: number) => void;
}

const W = 400;
const LABEL = 36;
const BARS = 58;
const GAP = 2;
const TOP = 16;
const COL = (W - LABEL - BARS - 8) / 12;
const ROW = 15;

export function Calendar({ series, stats, range, focusYear, hoverMonth, waveKey, onHover, onRange, onFocusYear }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [draft, setDraftState] = useState<{ anchor: number; to: number } | null>(null);
  // Pointer events can arrive several per frame; read the live value, not the last render's.
  const draftRef = useRef(draft);
  const setDraft = (next: typeof draft) => { draftRef.current = next; setDraftState(next); };
  const years = stats.years;
  const gridBottom = TOP + years.length * ROW;
  const avgY = gridBottom + 8;
  const height = avgY + ROW + 4;

  const color = useMemo(() => {
    const usable = series.values.filter((v, m): v is number => v !== null && !series.partial[m]);
    return heatScale(Math.max(1, ...usable));
  }, [series]);
  const maxTotal = Math.max(1, ...[...stats.yearTotals.values()].map((v) => v ?? 0));
  const anomaly = anomalyScale(0.8);

  const shown = draft
    ? { from: Math.min(draft.anchor, draft.to), to: Math.max(draft.anchor, draft.to) }
    : range;

  function monthAt(event: React.PointerEvent): number | null {
    const box = svg.current!.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * W - LABEL;
    const y = ((event.clientY - box.top) / box.width) * W - TOP;
    const col = Math.floor(x / COL);
    const row = Math.floor(y / ROW);
    if (col < 0 || col > 11 || row < 0 || row >= years.length) return null;
    return row * 12 + col;
  }

  const hovered = hoverMonth !== null ? {
    m: hoverMonth,
    value: series.values[hoverMonth],
    partial: series.partial[hoverMonth],
    clim: stats.climatology[hoverMonth % 12],
    year: series.startYear + Math.floor(hoverMonth / 12),
  } : null;

  return (
    <div className="relative select-none" style={{ containerType: "inline-size" }}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${height}`}
        className="block w-full touch-pan-y"
        role="grid"
        aria-label="Detections by year and month. Drag across months to set the date range."
        data-vaul-no-drag=""
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") return;
          const m = monthAt(e);
          if (m === null) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDraft({ anchor: m, to: m });
        }}
        onPointerMove={(e) => {
          const m = monthAt(e);
          const current = draftRef.current;
          if (current && m !== null && m !== current.to) setDraft({ ...current, to: m });
          if (m !== hoverMonth) onHover(m);
        }}
        onPointerUp={(e) => {
          const draft = draftRef.current;
          if (!draft) {
            // Touch: a tap shows that month's detail.
            const m = monthAt(e);
            if (m !== null) onHover(m);
            return;
          }
          const next = { from: Math.min(draft.anchor, draft.to), to: Math.max(draft.anchor, draft.to) };
          setDraft(null);
          if (next.from === next.to) onFocusYear(series.startYear + Math.floor(next.from / 12));
          else onRange(next);
        }}
        onPointerLeave={() => { if (!draftRef.current) onHover(null); }}
      >
        <defs>
          <pattern id="nodata" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#121829" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#2A3350" strokeWidth="1.5" />
          </pattern>
        </defs>

        {MONTHS.map((name, c) => (
          <text key={name} x={LABEL + c * COL + COL / 2} y={10} textAnchor="middle" fontSize="9" fill="#9AA6C0">
            {name[0]}
          </text>
        ))}
        <text x={W - BARS} y={10} fontSize="9" fill="#9AA6C0">Year total</text>

        <g key={waveKey}>
          {years.map((year, r) => {
            const y = TOP + r * ROW;
            const focused = year === focusYear;
            const total = stats.yearTotals.get(year) ?? null;
            const rel = total !== null && stats.meanYear ? total / stats.meanYear - 1 : null;
            return (
              <g key={year}>
                <text
                  x={LABEL - 6} y={y + ROW - 4.5} textAnchor="end" fontSize="9.5"
                  fill={focused ? "#FC3D21" : "#9AA6C0"} fontWeight={focused ? 700 : 400}
                  className="num cursor-pointer"
                  onClick={() => onFocusYear(year)}
                >
                  {year}
                </text>
                {MONTHS.map((_, c) => {
                  const m = r * 12 + c;
                  const value = series.values[m];
                  const inRange = m >= shown.from && m <= shown.to;
                  const fill = value === null ? "url(#nodata)" : color(value);
                  return (
                    <g key={c} className="cell" tabIndex={c === 0 && r === 0 ? 0 : -1} role="gridcell"
                      aria-label={`${MONTHS_LONG[c]} ${year}: ${value === null ? "no source data" : `${fmt(value)} hotspots`}`}>
                      <motion.rect
                        x={LABEL + c * COL} y={y} width={COL - GAP} height={ROW - GAP} rx={2}
                        initial={{ fill: value === null ? fill : HEAT_ZERO, opacity: 0.25 }}
                        animate={{ fill, opacity: inRange ? 1 : 0.22 }}
                        transition={{
                          fill: { delay: r * 0.028 + c * 0.008, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                          opacity: { duration: draft ? 0.08 : 0.25 },
                        }}
                        stroke={m === hoverMonth ? "#E8ECF5" : series.partial[m] ? "#9AA6C0" : "none"}
                        strokeWidth={m === hoverMonth ? 1.5 : 1}
                        strokeDasharray={series.partial[m] && m !== hoverMonth ? "2 1.5" : undefined}
                      />
                    </g>
                  );
                })}
                {total !== null ? (
                  <motion.rect
                    x={W - BARS} y={y + 2} height={ROW - GAP - 4} rx={1.5}
                    initial={{ width: 0 }}
                    animate={{ width: Math.max(1.5, (total / maxTotal) * (BARS - 4)) }}
                    transition={{ delay: 0.25 + r * 0.028, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    fill={focused ? "#E8ECF5" : "#6B7699"}
                    opacity={focused ? 1 : stats.baselineYears.includes(year) ? 0.8 : 0.35}
                    className="cursor-pointer"
                    onClick={() => onFocusYear(year)}
                  >
                    <title>{`${year}: ${fmt(total)} hotspots${rel !== null ? `, ${fmtPercent(rel)} vs average year` : ""}`}</title>
                  </motion.rect>
                ) : (
                  <line x1={W - BARS} x2={W - BARS + 10} y1={y + ROW / 2 - 1} y2={y + ROW / 2 - 1} stroke="#2A3350" strokeWidth={2}>
                    <title>{`${year}: incomplete year, not compared`}</title>
                  </line>
                )}
                {focused && <rect x={LABEL - 3} y={y} width={1.5} height={ROW - GAP} fill="#FC3D21" />}
              </g>
            );
          })}
        </g>

        <text x={LABEL - 6} y={avgY + ROW - 4.5} textAnchor="end" fontSize="9.5" fill="#E8ECF5" fontWeight={600}>Avg</text>
        {stats.climatology.map((clim, c) => (
          <rect
            key={c} x={LABEL + c * COL} y={avgY} width={COL - GAP} height={ROW - GAP} rx={2}
            fill={clim === null ? "url(#nodata)" : color(clim)}
          >
            <title>{clim === null ? "Average needs 3 complete years" : `${MONTHS_LONG[c]} average: ${fmt(Math.round(clim))} hotspots`}</title>
          </rect>
        ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-2xl shadow-black/50"
          style={{
            left: `${((LABEL + (hovered.m % 12) * COL + COL / 2) / W) * 100}%`,
            top: `calc(${((TOP + Math.floor(hovered.m / 12) * ROW) / W) * 100}cqw - 8px)`,
            transform: "translate(-50%, -100%)",
          }}
          role="status"
        >
          <div className="font-semibold">{MONTHS_LONG[hovered.m % 12]} {hovered.year}</div>
          <div className="num text-muted">
            {hovered.value === null ? "No source data" : `${fmt(hovered.value)} hotspots`}
            {hovered.partial && hovered.value !== null ? " (partial month)" : ""}
          </div>
          {hovered.value !== null && hovered.clim !== null && !hovered.partial && hovered.clim > 0 && (
            <div className="num" style={{ color: anomaly(hovered.value / hovered.clim - 1) }}>
              {fmtPercent(hovered.value / hovered.clim - 1)} vs {MONTHS[hovered.m % 12]} average
            </div>
          )}
        </div>
      )}
    </div>
  );
}
