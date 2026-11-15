import { scaleLinear } from "d3-scale";
import { motion } from "motion/react";
import { useMemo } from "react";
import { fmt } from "../../lib/format";
import { labelOf, MIN_BASELINE_YEARS, type Range, type Stats } from "../../lib/series";
import { fmtTick, latestCompleteMonth } from "../../lib/seasonal";
import type { MonthlySeries } from "../../lib/types";
import { FOCUS, H, Key, LEFT, MUTED, RIGHT, TEXT, transition } from "./plot";

export function LatestMonth({ series, stats, focus, range, width, animationKey }: {
  series: MonthlySeries; stats: Stats; focus: number | null; range: Range; width: number; animationKey: string;
}) {
  const latest = useMemo(() => latestCompleteMonth(series, stats), [series, stats]);
  if (!latest) return <p className="chart-answer">There is no complete month to compare yet.</p>;
  const { value, baseline, band, year, index } = latest;
  const label = labelOf(series.startYear, index);
  const position = !band ? null : value > band.p90 ? "above the usual range" : value < band.p10 ? "below the usual range"
    : value > band.median ? "in the upper part of the usual range" : value < band.median ? "in the lower part of the usual range" : "at the usual median";
  const x = scaleLinear().domain([0, Math.max(1, value, ...baseline.map((p) => p.value))]).nice().range([LEFT, width - RIGHT]);
  const highlight = year === focus ? FOCUS : TEXT;
  return <>
    <p className="chart-answer">{position ? `${label} was ${position}${latest.rank === null ? "" : ` (rank ${latest.rank} of ${baseline.length + 1}, highest first)`}.`
      : `${label} needs ${MIN_BASELINE_YEARS} earlier complete baseline years for comparison.`}</p>
    <div className="chart-readout">{label} · Latest complete month · {fmt(value)} hotspots{latest.provisional ? " · Provisional" : ""}
      {(index < range.from || index > range.to) && " · Outside selected dates"}</div>
    <svg width="100%" height={H} viewBox={`0 0 ${width} ${H}`} className="block" role="img"
      aria-label={`How does the latest complete month compare? ${label}: ${fmt(value)} hotspots${latest.provisional ? ", provisional" : ""}.`}>
      <desc>Each small dot is the same calendar month in an earlier complete baseline year. The large hollow dot is the latest complete month. The span is p10 to p90; the vertical tick is the median. Rank 1 is highest; ties share a rank.</desc>
      <motion.g key={animationKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={transition}>
        {band && <>
          <rect x={x(band.p10)} y={48} width={Math.max(1, x(band.p90) - x(band.p10))} height={40} fill={MUTED} fillOpacity={0.18} />
          <line x1={x(band.median)} x2={x(band.median)} y1={40} y2={96} stroke={TEXT} strokeWidth={2} />
        </>}
        {baseline.map((p, i) => <circle key={p.year} cx={x(p.value)} cy={58 + (i % 3) * 10} r={3} fill={p.year === focus ? FOCUS : MUTED}>
          <title>{`${labelOf(series.startYear, (p.year - series.startYear) * 12 + latest.month)}: ${fmt(p.value)} hotspots${p.provisional ? " (provisional)" : ""}`}</title>
        </circle>)}
        <circle cx={x(value)} cy={68} r={7} fill="var(--color-surface)" stroke={highlight} strokeWidth={2.5}>
          <title>{`${label}: ${fmt(value)} hotspots${latest.provisional ? " (provisional)" : ""}`}</title>
        </circle>
      </motion.g>
      <line x1={LEFT} x2={width - RIGHT} y1={119} y2={119} stroke="var(--color-border)" />
      {x.ticks(width < 400 ? 3 : 5).map((tick) => <text key={tick} x={x(tick)} y={139} textAnchor="middle" fill={MUTED} fontSize={11}>{fmtTick(tick)}</text>)}
    </svg>
    <div className="chart-legend"><span>○ Latest complete month</span><span>● Past years</span>
      {band && <><Key color={MUTED} band>p10–p90</Key><span>│ Median {fmt(band.median)}</span></>}
      {(year === focus || baseline.some((p) => p.year === focus)) && <Key color={FOCUS}>{focus}</Key>}
      {baseline.some((p) => p.provisional) && <span>Baseline includes provisional data</span>}
    </div>
  </>;
}
