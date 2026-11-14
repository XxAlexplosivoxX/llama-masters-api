import { AlertTriangle } from "lucide-react";
import { VALUE, TICK, fmtTick } from "../lib/chart";
import { ALERT, anomalyScale, GRID, MUTED, TEXT } from "../lib/color";
import { fmt, fmtPercent } from "../lib/format";
import { currentMonth } from "../lib/seasonal";
import { labelOf, MIN_BASELINE_YEARS, MONTHS_LONG, type Stats } from "../lib/shared";
import { useWidth } from "../hooks/useWidth";
import type { MonthlySeries } from "../types";

const anomaly = anomalyScale(0.8);
const H = 46;

/** The latest month of the series against the baseline median and p10–p90 of the same calendar month. */
export function CurrentMonth({ series, stats }: { series: MonthlySeries; stats: Stats }) {
  const { ref, width } = useWidth();
  const now = currentMonth(series, stats);
  if (!now) return <p className="text-sm text-muted">No month with data yet.</p>;

  const label = labelOf(series.startYear, now.index);
  const incomplete = now.partial || now.provisional;
  const status = [now.partial && "month in progress", now.provisional && "provisional"].filter(Boolean).join(", ");
  const hasBand = now.p10 !== null;
  const max = Math.max(1, now.value, now.p90 ?? 0) * 1.08;
  const pad = 8;
  const x = (v: number) => pad + (v / max) * Math.max(width - 2 * pad, 1);

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="num mt-0.5 text-2xl font-semibold leading-tight tracking-tight">
          {fmt(Math.round(now.value))} <span className="text-sm font-normal text-muted">hotspots</span>
        </div>
        <div className="mt-1 text-sm">
          {!hasBand ? <span className="text-muted">Needs {MIN_BASELINE_YEARS} baseline years of {MONTHS_LONG[now.index % 12]}</span>
            : (
              <>
                <span className="font-semibold">{now.position}</span>
                {now.anomaly !== null && (
                  <span className="num ml-2" style={{ color: anomaly(now.anomaly) }}>{fmtPercent(now.anomaly)} vs median</span>
                )}
              </>
            )}
        </div>
        {incomplete && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-alert">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span>{status[0].toUpperCase() + status.slice(1)}: the count will still change, so no anomaly % is given.</span>
          </p>
        )}
      </div>

      <div ref={ref} className="min-w-0">
        {hasBand && width > 0 && (
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block" role="img"
            aria-label={`${label}: ${fmt(Math.round(now.value))} hotspots${status ? ` (${status})` : ""}; ${MONTHS_LONG[now.index % 12]} median ${fmt(Math.round(now.p50!))}, p10 ${fmt(Math.round(now.p10!))}, p90 ${fmt(Math.round(now.p90!))} over ${now.n} baseline years; ${now.position}.`}>
            <line x1={pad} x2={width - pad} y1={20} y2={20} stroke={GRID} strokeWidth={2} />
            <rect x={x(now.p10!)} y={13} width={Math.max(x(now.p90!) - x(now.p10!), 2)} height={14} rx={3} fill={MUTED} opacity={0.35} />
            <line x1={x(now.p50!)} x2={x(now.p50!)} y1={9} y2={31} stroke={TEXT} strokeWidth={2} />
            <g transform={`translate(${x(now.value)},20)`}>
              <circle r={7} fill={incomplete ? "none" : ALERT} stroke={ALERT} strokeWidth={2.5} strokeDasharray={incomplete ? "3 2" : undefined} />
            </g>
            <text x={x(now.p10!)} y={44} fontSize={TICK.size} fill={TICK.fill} textAnchor="middle" className="num">p10 {fmtTick(now.p10!)}</text>
            <text x={x(now.p50!)} y={7} fontSize={TICK.size} fill={VALUE.fill} textAnchor="middle" className="num">median {fmtTick(now.p50!)}</text>
            <text x={x(now.p90!)} y={44} fontSize={TICK.size} fill={TICK.fill} textAnchor="middle" className="num">p90 {fmtTick(now.p90!)}</text>
          </svg>
        )}
        {hasBand && (
          <p className="mt-1 text-xs text-muted">
            Band: p10–p90 of {MONTHS_LONG[now.index % 12]} over {now.n} baseline years
            {series.baselineFrom ? ` (${series.baselineFrom}+)` : ""}; line: median; dot: {label}
            {incomplete ? " (dashed: incomplete)" : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
