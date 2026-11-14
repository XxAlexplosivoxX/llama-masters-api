import { anomalyScale } from "../lib/color";
import { fmt, fmtCompact, fmtPercent, ordinal } from "../lib/format";
import { labelOf, MIN_BASELINE_YEARS, MONTHS, rankOf, type Range, type Stats } from "../lib/series";
import type { MonthlySeries } from "../lib/types";
import { CountUp } from "./CountUp";

interface Props {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  focusYear: number | null;
}

function Figure({ label, children, caption }: { label: string; children: React.ReactNode; caption: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight">{children}</div>
      <div className="mt-1 text-xs leading-snug text-muted">{caption}</div>
    </div>
  );
}

export function KeyNumbers({ series, stats, range, focusYear }: Props) {
  const anomaly = anomalyScale(0.8);
  const total = focusYear !== null ? stats.yearTotals.get(focusYear) ?? null : null;
  const rel = total !== null && stats.meanYear ? total / stats.meanYear - 1 : null;
  const inBaseline = focusYear !== null && stats.baselineYears.includes(focusYear);
  const rank = inBaseline ? rankOf(stats, focusYear) : null;
  const noBaseline = `Needs ${MIN_BASELINE_YEARS} complete years`;

  return (
    <div className="grid grid-cols-3 gap-4">
      <Figure
        label="Detections"
        caption={`${labelOf(series.startYear, range.from)} to ${labelOf(series.startYear, range.to)}`}
      >
        <CountUp value={stats.rangeTotal} format={fmtCompact} />
      </Figure>
      <Figure
        label="Fire season"
        caption={stats.peak ? `${Math.round(stats.peak.share * 100)}% of an average year` : noBaseline}
      >
        {stats.peak ? `${MONTHS[stats.peak.from]}–${MONTHS[stats.peak.to]}` : "—"}
      </Figure>
      <Figure
        label={focusYear !== null ? `${focusYear} vs average` : "Year vs average"}
        caption={rank !== null
          ? rank === 1 ? `Most active of ${stats.baselineYears.length} years` : `${ordinal(rank)} most active of ${stats.baselineYears.length}`
          : total === null && focusYear !== null ? `${focusYear} is incomplete`
          : rel !== null ? `Before ${series.baselineFrom}, not ranked` : noBaseline}
      >
        {rel !== null ? (
          <span style={{ color: anomaly(rel) }}>
            <CountUp value={Math.round(rel * 100)} format={(n) => fmtPercent(n / 100)} />
          </span>
        ) : "—"}
      </Figure>
      {total !== null && (
        <p className="col-span-3 -mt-1 text-xs text-muted">
          {focusYear}: <span className="num text-text">{fmt(total)}</span> detections, against an average of{" "}
          <span className="num text-text">{fmt(Math.round(stats.meanYear ?? 0))}</span> per year.
        </p>
      )}
    </div>
  );
}
