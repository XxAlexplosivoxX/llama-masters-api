import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AXIS, fmtTick, TICK, thinBy } from "../lib/chart";
import { ALERT, ANOM, anomalyScale, BG, fireflyScale, GRID, MUTED, TEXT } from "../lib/color";
import { fmt, fmtPercent } from "../lib/format";
import { percentile } from "../lib/seasonal";
import { Ramp } from "./Ramp";
import { MIN_BASELINE_YEARS, MONTHS, MONTHS_LONG, type Range, type Stats } from "../lib/shared";
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

const ERA = 84; // left margin for era brackets
const YEAR = 44; // year label column
const GAP = 2;
const TOP = 20;
const MAX_COL = 44;
const BAR_GAP = 10;
const BAR = 56; // annual-total bar
const BAR_TXT = 40;
const LIMIT = 0.8; // anomaly colours saturate at ±80 %
const anomalyColor = anomalyScale(LIMIT);
const VIIRS_YEAR = 2012;
type Mode = "counts" | "anomaly";

/** True on touch-first devices, where rows grow to 24 px and the calendar may scroll. */
function useCoarsePointer() {
  const query = "(pointer: coarse)";
  const [coarse, setCoarse] = useState(() => typeof matchMedia !== "undefined" && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setCoarse(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return coarse;
}

/** Years × months heatmap with annual totals, a baseline-median row, era notes and a live readout. */
export function Calendar({ series, stats, range, focusYear, focusMonth, onFocus }: Props) {
  const { ref, width } = useWidth();
  const coarse = useCoarsePointer();
  const svgRef = useRef<SVGSVGElement>(null);
  const years = stats.years;
  const base = series.baselineFrom;
  const ROW = coarse ? 24 : 16;

  const era = width >= 560 ? ERA : 0;
  const COL = Math.min(MAX_COL, Math.max(8, (width - era - YEAR - BAR_GAP - BAR - BAR_TXT) / 12));
  const gridX = era + YEAR;
  const barX = gridX + 12 * COL + BAR_GAP;
  const svgW = barX + BAR + BAR_TXT;
  const medianY = TOP + years.length * ROW + 8;
  const height = medianY + ROW + 4;
  const yearStep = ROW < 14 ? 2 : 1;
  const monthStep = thinBy(COL, 14);

  const { color, max, median } = useMemo(() => {
    const usable = series.values.filter((v): v is number => v !== null);
    const max = Math.max(1, ...usable);
    const positive = usable.filter((v) => v > 0).sort((a, b) => a - b);
    return { color: fireflyScale(max), max, median: positive.length ? percentile(positive, 0.5) : null };
  }, [series]);

  // Baseline median per calendar month, the same reference as the KPIs and the current-month card.
  const medians = useMemo(() => Array.from({ length: 12 }, (_, c) => {
    const vals = stats.baselineYears
      .map((y) => series.values[(y - series.startYear) * 12 + c])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    return vals.length >= MIN_BASELINE_YEARS ? percentile(vals, 0.5) : null;
  }), [series, stats]);
  const hasMedian = medians.some((c) => c !== null);

  const [chosen, setChosen] = useState<Mode | null>(null);
  const mode: Mode = chosen ?? (hasMedian ? "anomaly" : "counts");

  // Annual totals only for complete baseline years; the rest stay empty.
  const totals = years.map((y) => (stats.baselineYears.includes(y) ? stats.yearTotals.get(y) ?? null : null));
  const maxTotal = Math.max(1, ...totals.map((t) => t ?? 0));

  const isProvisional = (m: number) => series.provisionalFrom !== undefined && m >= series.provisionalFrom;
  /** value / baseline median of that calendar month − 1; null whenever the month must not be compared. */
  const anomalyOf = (m: number): number | null => {
    const value = series.values[m];
    const ref = medians[m % 12];
    const year = series.startYear + Math.floor(m / 12);
    if (value === null || series.partial[m] || isProvisional(m) || ref === null || ref <= 0) return null;
    if (base !== undefined && year < base) return null;
    return value / ref - 1;
  };

  const [active, setActive] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number>(() => focusMonth ?? 0);
  const shown = active ?? focusMonth;

  /** One month's readout, shared by the fixed line and the floating tooltip. */
  const cellState = (m: number) => {
    const value = series.values[m];
    const head = `${MONTHS[m % 12]} ${series.startYear + Math.floor(m / 12)}`;
    const anom = anomalyOf(m);
    const status = value === null ? "none" as const : series.partial[m] ? "partial" as const
      : isProvisional(m) ? "provisional" as const : anom !== null ? "compared" as const : "not" as const;
    return { head, value, anom, status, median: medians[m % 12] };
  };
  const describe = (m: number) => {
    const s = cellState(m);
    if (s.value === null) return `${s.head} · no source data`;
    const tail = { partial: "partial month", provisional: "provisional", compared: `${fmtPercent(s.anom ?? 0)} vs median`, not: "not compared" }[s.status as Exclude<typeof s.status, "none">];
    return `${s.head} · ${fmt(Math.round(s.value))} hotspots · ${tail}`;
  };

  // Floating tooltip (fine pointers only); the aria-live line above stays the accessible readout.
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ m: number; x: number; y: number } | null>(null);
  const showTip = (m: number, clientX: number, clientY: number) => {
    if (coarse || !boxRef.current) return;
    const box = boxRef.current.getBoundingClientRect();
    setTip({ m, x: clientX - box.left, y: clientY - box.top });
  };
  const tipAtCell = (m: number) => {
    const cell = svgRef.current?.querySelector<SVGGElement>(`[data-cell="${m}"] rect`)?.getBoundingClientRect();
    if (cell) showTip(m, cell.right, cell.top);
  };
  // Keep the tooltip inside the calendar box: flip left/up when it would overflow.
  useLayoutEffect(() => {
    const el = tipRef.current, box = boxRef.current;
    if (!tip || !el || !box) return;
    const w = el.offsetWidth, h = el.offsetHeight, bw = box.clientWidth, bh = box.clientHeight, off = 12;
    let left = tip.x + off, top = tip.y + off;
    if (left + w > bw) left = tip.x - off - w;
    if (top + h > bh) top = tip.y - off - h;
    el.style.left = `${Math.max(0, Math.min(left, bw - w))}px`;
    el.style.top = `${Math.max(0, Math.min(top, bh - h))}px`;
  }, [tip]);

  const ym = (m: number) => `${series.startYear + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
  const pick = (m: number) => onFocus(series.startYear + Math.floor(m / 12), m, ym(m));
  const move = (m: number) => {
    const next = Math.max(0, Math.min(years.length * 12 - 1, m));
    setCursor(next);
    svgRef.current?.querySelector<SVGGElement>(`[data-cell="${next}"]`)?.focus();
  };
  const onKey = (e: React.KeyboardEvent, m: number) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -12, ArrowDown: 12, Home: -(m % 12), End: 11 - (m % 12) }[e.key];
    if (e.key === "Escape") { setTip(null); return; }
    if (step !== undefined) { e.preventDefault(); move(m + step); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(m); }
  };

  const activeRow = shown !== null ? Math.floor(shown / 12) : null;
  const activeCol = shown !== null ? shown % 12 : null;
  const showViirs = (series.kind ?? "HARMONIZED") === "HARMONIZED" && years.includes(VIIRS_YEAR - 1) && years.includes(VIIRS_YEAR);
  const preBaseRows = base !== undefined ? years.filter((y) => y < base).length : 0;

  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="seg" role="group" aria-label="Calendar colour">
          {(["anomaly", "counts"] as const).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setChosen(m)}
              disabled={m === "anomaly" && !hasMedian}
              className={`disabled:opacity-40 ${mode === m ? "bg-slate-800" : ""}`}>
              {m === "counts" ? "Counts" : "Anomaly"}
            </button>
          ))}
        </div>
        {mode === "anomaly" && (
          <p className="text-xs text-muted">vs the {base ? `${base}+ ` : ""}baseline median of each calendar month · + / − marks ±25 % or more</p>
        )}
      </div>

      <p className="num mb-1 min-h-5 text-sm text-text" aria-live="polite">
        {shown !== null ? describe(shown) : <span className="text-muted">Hover or focus a month to read its value.</span>}
      </p>

      <div ref={boxRef} className={`relative ${coarse ? "dark-scroll max-h-[36rem] overflow-auto" : ""}`}>
      {width > 0 && (
        <svg ref={svgRef} viewBox={`0 0 ${svgW} ${height}`} width={svgW} height={height} className="block" role="grid"
          {...{ [CALENDAR_EXPORT]: "" }} aria-label="Hotspots by year and month" onPointerLeave={() => { setActive(null); setTip(null); }}>
          <defs>
            <pattern id="partial" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={ALERT} strokeWidth="1.2" />
            </pattern>
          </defs>

          {/* Header */}
          {MONTHS.map((name, c) => (
            c % monthStep === 0 && (
              <text key={name} x={gridX + c * COL + COL / 2} y={13} textAnchor="middle" fontSize={TICK.size}
                fill={c === activeCol ? TEXT : TICK.fill} fontWeight={c === activeCol ? 700 : 400}>
                {COL >= 28 ? name : name[0]}
              </text>
            )
          ))}
          <text x={barX} y={13} fontSize={TICK.size} fill={TICK.fill}>Year total</text>

          {/* Era brackets in the left margin, never over the cells */}
          {era > 0 && preBaseRows > 0 && (
            <g>
              <path d={`M${era - 4},${TOP + 1} h-4 V${TOP + preBaseRows * ROW - GAP - 1} h4`} fill="none" stroke={MUTED} />
              <text x={era - 12} y={TOP + (preBaseRows * ROW) / 2 - 2} textAnchor="end" fontSize={TICK.size} fill={MUTED}>
                <tspan x={era - 12}>Before {base}</tspan>
                <tspan x={era - 12} dy={13}>see note ¹</tspan>
                <title>{series.baselineNote}</title>
              </text>
            </g>
          )}
          {era > 0 && showViirs && (() => {
            const r = years.indexOf(VIIRS_YEAR);
            return (
              <g>
                <path d={`M${era - 4},${TOP + r * ROW - 1} h-4 V${TOP + (r + 1) * ROW - GAP} h4`} fill="none" stroke={MUTED} />
                <text x={era - 12} y={TOP + r * ROW + ROW / 2 + 4} textAnchor="end" fontSize={TICK.size} fill={MUTED}>VIIRS joins</text>
              </g>
            );
          })()}

          {/* Active row/column highlight */}
          {activeRow !== null && activeRow < years.length && (
            <rect x={gridX - 1} y={TOP + activeRow * ROW - 1} width={12 * COL} height={ROW} rx={3} fill="none" stroke={TEXT} strokeOpacity={0.35} pointerEvents="none" />
          )}
          {activeCol !== null && (
            <rect x={gridX + activeCol * COL - 1} y={TOP - 1} width={COL} height={years.length * ROW} rx={3} fill="none" stroke={TEXT} strokeOpacity={0.35} pointerEvents="none" />
          )}

          {years.map((year, r) => {
            const y = TOP + r * ROW;
            const faded = base !== undefined && year < base;
            const total = totals[r];
            return (
              <g key={year}>
                {r % yearStep === 0 && (
                  <text x={gridX - 6} y={y + ROW / 2 + 4} textAnchor="end" fontSize={AXIS.size}
                    fill={year === focusYear || r === activeRow ? TEXT : MUTED} fontWeight={year === focusYear ? 700 : 400} className="num">
                    {year}
                  </text>
                )}
                <g opacity={faded ? 0.4 : 1}>
                  {MONTHS.map((_, c) => {
                    const m = r * 12 + c;
                    const value = series.values[m];
                    const inRange = m >= range.from && m <= range.to;
                    const provisional = isProvisional(m);
                    const selected = year === focusYear && m === focusMonth;
                    const anom = mode === "anomaly" ? anomalyOf(m) : null;
                    const notCompared = mode === "anomaly" && value !== null && anom === null;
                    const fill = value === null ? "none" : mode === "counts" ? color(value) : anom === null ? GRID : anomalyColor(anom);
                    const x = gridX + c * COL, w = Math.max(COL - GAP, 1), h = ROW - GAP;
                    return (
                      <g key={c} pointerEvents="none">
                        <rect x={x} y={y} width={w} height={h} rx={2} fill={fill}
                          stroke={value === null ? GRID : selected ? TEXT : "none"} strokeWidth={selected ? 1.6 : 0.8}
                          opacity={inRange ? 1 : 0.25} />
                        {value !== null && series.partial[m] && (
                          <rect x={x} y={y} width={w} height={h} rx={2} fill="url(#partial)" opacity={inRange ? 1 : 0.25} />
                        )}
                        {provisional && <circle cx={x + 4} cy={y + 4} r={1.8} fill={MUTED} />}
                        {notCompared && !series.partial[m] && !provisional && (
                          <line x1={x + 4} x2={x + w - 4} y1={y + h / 2} y2={y + h / 2} stroke={MUTED} strokeWidth={1} />
                        )}
                        {anom !== null && Math.abs(anom) >= 0.25 && COL >= 16 && (
                          <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={BG} aria-hidden>
                            {anom > 0 ? "+" : "−"}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
                {total !== null && (
                  <g>
                    <rect x={barX} y={y + h3(ROW)} width={Math.max(1, (total / maxTotal) * BAR)} height={ROW - 2 * h3(ROW) - GAP} rx={1.5} fill={MUTED}>
                      <title>{`${year}: ${fmt(Math.round(total))} hotspots`}</title>
                    </rect>
                    <text x={barX + BAR + 4} y={y + ROW / 2 + 4} fontSize={TICK.size} fill={TICK.fill} className="num">{fmtTick(Math.round(total))}</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Baseline median row: counts colour in counts mode, plain numbers in anomaly mode (no unlabelled ramp) */}
          <text x={gridX - 6} y={medianY + ROW / 2 + 4} textAnchor="end" fontSize={AXIS.size} fill={TEXT}>Median</text>
          {medians.map((v, c) => {
            const numbers = mode === "anomaly";
            const text = v === null ? "–" : fmtTick(Math.round(v));
            // Labels need ~7 px per character; on narrow columns every other month is labelled (all keep a tooltip).
            const labelEvery = COL - GAP >= text.length * 7 + 2 ? 1 : 2;
            return (
              <g key={c}>
                <rect x={gridX + c * COL} y={medianY} width={Math.max(COL - GAP, 1)} height={ROW - GAP} rx={2}
                  fill={numbers || v === null ? "none" : color(v)} stroke={v === null || numbers ? GRID : TEXT}
                  strokeOpacity={v === null || numbers ? 1 : 0.5} strokeWidth={0.8}>
                  <title>{`${MONTHS_LONG[c]} baseline median: ${v === null ? "not enough years" : fmt(Math.round(v))}`}</title>
                </rect>
                {numbers && c % labelEvery === 0 && (
                  <text x={gridX + c * COL + (COL - GAP) / 2} y={medianY + (ROW - GAP) / 2 + 4} textAnchor="middle"
                    fontSize={TICK.size} fill={TEXT} className="num" pointerEvents="none">{text}</text>
                )}
              </g>
            );
          })}

          {/* Hit layer: one focusable zone per month, drawn last so it owns the pointer */}
          {years.map((year, r) => MONTHS.map((_, c) => {
            const m = r * 12 + c;
            const value = series.values[m];
            const anom = anomalyOf(m);
            const status = value === null ? "no source data"
              : `${fmt(Math.round(value))} hotspots${series.partial[m] ? ", partial month" : ""}${isProvisional(m) ? ", provisional" : ""}`;
            const anomText = value === null ? "" : anom !== null ? `, ${fmtPercent(anom)} vs baseline median` : ", not compared";
            return (
              <g key={m} data-cell={m} className="cell" role="gridcell" tabIndex={m === cursor ? 0 : -1}
                aria-label={`${MONTHS_LONG[c]} ${year}: ${status}${anomText}`}
                onPointerEnter={(e) => { setActive(m); showTip(m, e.clientX, e.clientY); }}
                onPointerMove={(e) => showTip(m, e.clientX, e.clientY)}
                onFocus={(e) => { setActive(m); setCursor(m); if (e.currentTarget.matches(":focus-visible")) tipAtCell(m); }}
                onBlur={() => { setActive(null); setTip(null); }}
                onClick={() => pick(m)} onKeyDown={(e) => onKey(e, m)}>
                <rect x={gridX + c * COL} y={TOP + r * ROW} width={COL} height={ROW} fill="transparent" className="cursor-pointer" />
              </g>
            );
          }))}
        </svg>
      )}
      {tip && !coarse && (() => {
        const s = cellState(tip.m);
        const line3 = {
          none: "No source data",
          partial: "Partial month, will still change",
          provisional: "Provisional data",
          compared: `${fmtPercent(s.anom ?? 0)} vs median (${s.median !== null ? fmtTick(Math.round(s.median)) : "–"})`,
          not: "Not compared",
        }[s.status];
        return (
          <div ref={tipRef} aria-hidden style={{ left: tip.x + 12, top: tip.y + 12 }}
            className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border border-grid bg-card px-3 py-2 text-xs leading-snug text-text shadow-xl shadow-black/50">
            <div className="font-semibold">{s.head}</div>
            {s.value !== null && <div className="num">{fmt(Math.round(s.value))} hotspots</div>}
            <div className={`num ${s.status === "partial" || s.status === "provisional" ? "text-alert" : "text-muted"}`}>{line3}</div>
          </div>
        );
      })()}
      </div>

      {era === 0 && ((preBaseRows > 0 && series.baselineNote) || showViirs) && (
        <p className="mt-2 text-xs leading-snug text-muted">
          {[preBaseRows > 0 && series.baselineNote ? `Before ${base}: ${series.baselineNote}` : null, showViirs ? `VIIRS joins in ${VIIRS_YEAR}` : null]
            .filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {mode === "counts" ? (
          <Ramp
            label="Hotspots per month (square-root scale)"
            stops={Array.from({ length: 9 }, (_, i) => color(max * (i / 8) ** 2))}
            ticks={[
              { at: 0, text: "0" },
              ...(median !== null && median < max * 0.8 ? [{ at: Math.sqrt(median / max), text: fmtTick(Math.round(median)) }] : []),
              { at: 1, text: fmtTick(Math.round(max)) },
            ]}
          />
        ) : (
          <>
            <Ramp
              label="Anomaly vs baseline median"
              stops={ANOM}
              ticks={[
                { at: 0, text: fmtPercent(-LIMIT) },
                { at: 0.5, text: "0" },
                { at: 1, text: `${fmtPercent(LIMIT)}` },
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
      <ul className="mt-2 space-y-0.5 text-xs leading-snug text-muted">
        <li>Year total: complete {base ? `${base}+ ` : ""}years only, bar length to the same scale.{" "}
          {mode === "anomaly"
            ? "Median row: baseline median of each month, in hotspots."
            : "Median row: baseline median of each month, on the same colour scale."}</li>
        {era > 0 && preBaseRows > 0 && series.baselineNote && <li>¹ Before {base}: {series.baselineNote}</li>}
        {era > 0 && showViirs && <li>From {VIIRS_YEAR} the record averages MODIS with VIIRS on the MODIS scale; earlier years are MODIS only.</li>}
      </ul>
    </div>
  );
}

/** Vertical inset that turns a row into a thin bar. */
const h3 = (row: number) => Math.round(row / 4);
