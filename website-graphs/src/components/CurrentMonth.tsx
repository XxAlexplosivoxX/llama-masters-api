import { AlertTriangle } from "lucide-react";
import { scaleLinear } from "d3-scale";
import { fmtTick, TICK, VALUE } from "../lib/chart";
import { anomalyScale, CARD, GRID, MODIS, MODIS_EQ, MUTED, TEXT } from "../lib/color";
import { fmt, fmtPercent } from "../lib/format";
import { currentMonth, type CurrentMonth as Current } from "../lib/seasonal";
import { labelOf, MIN_BASELINE_YEARS, MONTHS, MONTHS_LONG, type Stats } from "../lib/shared";
import { useWidth } from "../hooks/useWidth";
import type { MonthlyGrid, MonthlySeries } from "../types";

const anomaly = anomalyScale(0.8);

// Strip-plot rows (px). Top margin keeps the median label inside the SVG.
const H = 124;
const PAD_L = 8;
const PAD_R = 30; // room for the "still rising" chevron at the far right
const MEDIAN_Y = 14;
const BAND_TOP = 26;
const BAND_H = 26;
const MID = BAND_TOP + BAND_H / 2;
const ENDS_Y = BAND_TOP + BAND_H + 16;
const VALUE_Y = ENDS_Y + 20;
const AXIS_Y = VALUE_Y + 12;
const R = 9; // current-month marker radius (18 px)
const CHAR = 7; // approximate width of a 12 px digit, for collision handling

/** Keeps a text centred at x fully inside [lo, hi]; returns the clamped centre. */
const clampCentre = (x: number, text: string, lo: number, hi: number) => {
  const half = (text.length * CHAR) / 2;
  return Math.min(Math.max(x, lo + half), hi - half);
};

const shortDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** Plain-language position against the usual range (p10–p90), with "near the end" inside the outer quarters. */
function headline(now: Current, inProgress: boolean): string {
  const { value, p10, p50, p90 } = now;
  if (p10 === null || p50 === null || p90 === null) return "";
  if (inProgress) return value < p10 ? "Low so far" : value > p90 ? "High so far" : "Within the usual range so far";
  if (value < p10) return "Below the usual range";
  if (value > p90) return "Above the usual range";
  if (value >= p50 + (p90 - p50) * 0.75) return "Near the high end of the usual range";
  if (value <= p10 + (p50 - p10) * 0.25) return "Near the low end of the usual range";
  return "Within the usual range";
}

/** The latest month of the series against the same calendar month in the baseline years. */
export function CurrentMonth({ series, stats, grid }: { series: MonthlySeries; stats: Stats; grid: MonthlyGrid | null }) {
  const { ref, width } = useWidth();
  const now = currentMonth(series, stats);
  if (!now) return <p className="text-sm text-muted">No data yet for this month.</p>;

  const label = labelOf(series.startYear, now.index);
  const monthName = MONTHS_LONG[now.index % 12];
  const inProgress = now.partial;
  const incomplete = now.partial || now.provisional;
  const hasBand = now.p10 !== null && now.p50 !== null && now.p90 !== null;
  const title = hasBand ? headline(now, inProgress) : `Needs ${MIN_BASELINE_YEARS} complete years to compare`;

  const kind = series.kind ?? "HARMONIZED";
  const through = grid
    ? (kind === "HARMONIZED" ? (["MODIS", "VIIRS"] as const) : kind === "MODIS" ? (["MODIS"] as const) : (["VIIRS"] as const))
      .filter((id) => grid.sensors[id]?.last_source_day)
      .map((id) => `${shortDay(grid.sensors[id].last_source_day)} (${id})`)
    : [];

  const years = now.baseline.map((b) => b.year);
  const legend = hasBand
    ? `Usual range = middle 80 % of ${monthName}s, ${Math.min(...years)}–${Math.max(...years)} (${now.n} years)`
    : "";
  const state = inProgress ? "month in progress, count will still rise" : now.provisional ? "provisional data" : "complete month";

  return (
    <div className="@container">
      <div className="grid gap-4 @[40rem]:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] @[40rem]:items-center">
        <div className="min-w-0">
          <div className="text-xs text-muted">{label}{inProgress ? " · so far" : ""}</div>
          <div className="num mt-0.5 text-3xl font-semibold leading-tight tracking-tight">
            {fmt(Math.round(now.value))} <span className="text-sm font-normal text-muted">hotspots</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-text">{title}</p>
          {now.anomaly !== null && hasBand && (
            <p className="num mt-0.5 flex items-center gap-1.5 text-sm text-text">
              <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="5" fill={anomaly(now.anomaly)} /></svg>
              {fmtPercent(now.anomaly)} vs the median {monthName}
            </p>
          )}
          {inProgress ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-alert">
              <AlertTriangle size={13} className="shrink-0" aria-hidden />
              Month in progress — count will still rise.
            </p>
          ) : now.provisional && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-alert">
              <AlertTriangle size={13} className="shrink-0" aria-hidden />
              Provisional data — may still be revised.
            </p>
          )}
          {through.length > 0 && <p className="mt-1 text-xs text-muted">Data through {through.join(" · ")}</p>}
        </div>

        {hasBand && (
          <div ref={ref} className="min-w-0">
            {width > 0 && <Strip now={now} width={width} label={label} monthName={monthName} incomplete={incomplete}
              inProgress={inProgress} title={title} state={state} />}
            <p className="mt-1 text-xs text-muted">{legend}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Strip({ now, width, label, monthName, incomplete, inProgress, title, state }: {
  now: Current; width: number; label: string; monthName: string; incomplete: boolean; inProgress: boolean; title: string; state: string;
}) {
  const p10 = now.p10!, p50 = now.p50!, p90 = now.p90!;
  const top = Math.max(1, p90, now.value, ...now.baseline.map((b) => b.value));
  const x = scaleLinear().domain([0, top]).nice().range([PAD_L, width - PAD_R]);
  const max = x.domain()[1];
  const lo = 0, hi = width;

  const medianText = `Median ${fmtTick(p50)}`;
  let lowText = fmtTick(p10), highText = fmtTick(p90);
  let lowX = clampCentre(x(p10), lowText, lo, hi), highX = clampCentre(x(p90), highText, lo, hi);
  const gap = (lowText.length + highText.length) * CHAR / 2 + 8;
  if (highX - lowX < gap) { // narrow band: push the two end labels apart around its centre
    const mid = (x(p10) + x(p90)) / 2;
    lowX = clampCentre(mid - gap / 2, lowText, lo, hi - gap);
    highX = lowX + gap;
  }
  if (highX - lowX < gap) { lowText = `${lowText}–${highText}`; highText = ""; }
  const valueText = `${inProgress ? "So far " : ""}${fmtTick(now.value)}`;
  const cx = x(now.value);

  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block" role="img"
      aria-label={`${label}: ${fmt(Math.round(now.value))} hotspots (${state}). ${title}. Median ${monthName}: ${fmt(Math.round(p50))}; usual range ${fmt(Math.round(p10))} to ${fmt(Math.round(p90))} over ${now.n} years.`}>
      <defs>
        <marker id="cm-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M1 1 L6 4 L1 7" fill="none" stroke={TEXT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* Usual range (p10–p90) */}
      <rect x={x(p10)} y={BAND_TOP} width={Math.max(x(p90) - x(p10), 3)} height={BAND_H} rx={6}
        fill={MODIS} fillOpacity={0.32} stroke={MODIS} strokeOpacity={0.8}>
        <title>{`Usual range (p10 · p90): ${fmt(Math.round(p10))} – ${fmt(Math.round(p90))}`}</title>
      </rect>

      {/* Each baseline year */}
      {now.baseline.map((b) => (
        <circle key={b.year} cx={x(b.value)} cy={MID} r={3} fill={TEXT} fillOpacity={0.45}>
          <title>{`${monthName} ${b.year}: ${fmt(Math.round(b.value))}`}</title>
        </circle>
      ))}

      {/* Median */}
      <line x1={x(p50)} x2={x(p50)} y1={BAND_TOP - 6} y2={BAND_TOP + BAND_H + 6} stroke={TEXT} strokeWidth={2.5} />
      <text x={clampCentre(x(p50), medianText, lo, hi)} y={MEDIAN_Y} textAnchor="middle" fontSize={VALUE.size} fontWeight={VALUE.weight}
        fill={VALUE.fill} className="num">{medianText}</text>

      {/* Ends of the usual range */}
      <text x={lowX} y={ENDS_Y} textAnchor="middle" fontSize={TICK.size} fill={TEXT} className="num">
        <title>Low end of usual range (p10)</title>{lowText}
      </text>
      {highText && (
        <text x={highX} y={ENDS_Y} textAnchor="middle" fontSize={TICK.size} fill={TEXT} className="num">
          <title>High end of usual range (p90)</title>{highText}
        </text>
      )}

      {/* Current month */}
      {inProgress && (
        <line x1={cx + R + 2} x2={cx + R + 18} y1={MID} y2={MID} stroke={TEXT} strokeWidth={2} strokeDasharray="3 2" markerEnd="url(#cm-arrow)" />
      )}
      <circle cx={cx} cy={MID} r={R} fill={MODIS_EQ} stroke={incomplete ? CARD : TEXT} strokeWidth={2.5} />
      {incomplete && <circle cx={cx} cy={MID} r={R} fill="none" stroke={TEXT} strokeWidth={2.5} strokeDasharray="4 3" />}
      <text x={clampCentre(cx, valueText, lo, hi)} y={VALUE_Y} textAnchor="middle" fontSize={VALUE.size} fontWeight={700}
        fill={MODIS_EQ} className="num">{valueText}</text>

      {/* Axis */}
      <line x1={x(0)} x2={x(max)} y1={AXIS_Y} y2={AXIS_Y} stroke={GRID} />
      <text x={x(0)} y={AXIS_Y + 13} textAnchor="start" fontSize={TICK.size} fill={MUTED} className="num">0</text>
      <text x={x(max)} y={AXIS_Y + 13} textAnchor="end" fontSize={TICK.size} fill={MUTED} className="num">{fmtTick(max)}</text>
    </svg>
  );
}
