import { AlertTriangle } from "lucide-react";
import { anomalyScale } from "../lib/color";
import { fmt, fmtCompact, fmtPercent, ordinal } from "../lib/format";
import { labelOf, MIN_BASELINE_YEARS, MONTHS, rankOf, SERIES_LABEL, type Range, type Stats } from "../lib/shared";
import { medianYear } from "../lib/seasonal";
import type { MonthlySeries } from "../types";

interface Props {
  series: MonthlySeries;
  stats: Stats;
  range: Range;
  focusYear: number | null;
}

const anomaly = anomalyScale(0.8);

function Figure({ label, children, caption }: { label: string; children: React.ReactNode; caption: React.ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-2xl border border-grid bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-0.5 text-2xl font-semibold leading-tight tracking-tight">{children}</div>
      <div className="mt-1 mt-auto pt-1 text-xs leading-snug text-muted">{caption}</div>
    </div>
  );
}

export function KeyNumbers({ series, stats, range, focusYear }: Props) {
  const kind = series.kind ?? "HARMONIZED";
  const total = focusYear !== null ? stats.yearTotals.get(focusYear) ?? null : null;
  const median = medianYear(stats);
  const rel = total !== null && median ? total / median - 1 : null;
  const rank = total !== null && stats.baselineYears.includes(focusYear!) ? rankOf(stats, focusYear!) : null;
  const partials = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i)
    .filter((m) => series.partial[m]).length;
  const provisional = series.provisionalFrom !== undefined && range.to >= series.provisionalFrom
    ? range.to - Math.max(range.from, series.provisionalFrom) + 1
    : 0;

  return (
    <>
      <Figure
        label="Hotspots in range"
        caption={`${labelOf(series.startYear, range.from)} – ${labelOf(series.startYear, range.to)} · ${SERIES_LABEL[kind]}${kind === "HARMONIZED" ? ", on the MODIS scale" : ""}`}
      >
        {fmtCompact(Math.round(stats.rangeTotal))}{" "}
        <span className="text-sm font-normal text-muted">hotspots</span>
      </Figure>
      <Figure
        label="Fire season"
        caption={stats.peak ? `${Math.round(stats.peak.share * 100)}% of an average year` : `Needs ${MIN_BASELINE_YEARS} complete years`}
      >
        {stats.peak ? `${MONTHS[stats.peak.from]}–${MONTHS[stats.peak.to]}` : "—"}
      </Figure>
      <Figure
        label={focusYear !== null ? `${focusYear} vs median year` : "Year vs median year"}
        caption={rank !== null
          ? rank === 1 ? `Most active of ${stats.baselineYears.length} years` : `${ordinal(rank)} most active of ${stats.baselineYears.length}`
          : total === null && focusYear !== null ? `${focusYear} is incomplete`
          : rel !== null ? `Before ${series.baselineFrom}, not ranked` : `Needs ${MIN_BASELINE_YEARS} complete years`}
      >
        {rel !== null ? <span style={{ color: anomaly(rel) }}>{fmtPercent(rel)}</span> : "—"}
      </Figure>
      <Figure
        label="Data quality"
        caption={partials + provisional === 0 ? "All months complete"
          : `${partials} partial, ${provisional} provisional months in range — never compared`}
      >
        {partials + provisional === 0 ? "Complete" : (
          <span className="inline-flex items-center gap-1.5 text-alert">
            <AlertTriangle size={18} aria-hidden />
            {fmt(partials + provisional)}
          </span>
        )}
      </Figure>
    </>
  );
}
