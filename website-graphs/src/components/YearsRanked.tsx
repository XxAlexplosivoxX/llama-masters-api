import { anomalyScale, MUTED, TEXT } from "../lib/color";
import { fmt, fmtCompact, fmtPercent } from "../lib/format";
import type { Stats } from "../lib/shared";

/** First year with VIIRS in the harmonized record. */
export const VIIRS_YEAR = 2012;

interface Props {
  stats: Stats;
  harmonized?: boolean; // tag years by era: MODIS only vs MODIS + VIIRS
  focusYear: number | null;
  onFocusYear: (year: number) => void;
}

const anomaly = anomalyScale(0.8);

/** Complete years ranked by their total, coloured by distance from the average year. */
export function YearsRanked({ stats, focusYear, onFocusYear, harmonized = false }: Props) {
  const rows = stats.baselineYears
    .map((year) => {
      const total = stats.yearTotals.get(year)!;
      const rel = stats.meanYear ? total / stats.meanYear - 1 : null;
      return { year, total, rel };
    })
    .sort((a, b) => b.total - a.total);
  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-grid p-4 text-sm text-muted">No complete years in this selection.</p>;
  }
  const max = Math.max(...rows.map((r) => r.total));
  const mixed = harmonized && rows.some((r) => r.year < VIIRS_YEAR) && rows.some((r) => r.year >= VIIRS_YEAR);

  return (
    <>
    {mixed && (
      <p className="mb-2 text-xs text-muted">
        The baseline mixes MODIS-only years (before {VIIRS_YEAR}, marked <span className="font-semibold text-text">M</span>) with MODIS + VIIRS years.
      </p>
    )}
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.year}>
          <button
            className="grid w-full grid-cols-[3rem_1fr_5.5rem] items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-bg"
            onClick={() => onFocusYear(r.year)} aria-pressed={r.year === focusYear}
          >
            <span className="num text-xs" style={{ color: r.year === focusYear ? TEXT : MUTED, fontWeight: r.year === focusYear ? 700 : 400 }}>
              {r.year}{mixed && r.year < VIIRS_YEAR && <span className="ml-1 font-semibold text-text" title="MODIS only">M</span>}
            </span>
            <span className="relative h-3 overflow-hidden rounded-sm bg-grid/40">
              <span
                className="block h-full rounded-sm"
                style={{ width: `${(r.total / max) * 100}%`, background: r.rel !== null ? anomaly(r.rel) : MUTED, opacity: r.year === focusYear ? 1 : 0.8 }}
              />
            </span>
            <span className="num text-right text-2xs" style={{ color: r.rel !== null ? anomaly(r.rel) : MUTED }}>
              {fmtCompact(Math.round(r.total))}{r.rel !== null ? ` · ${fmtPercent(r.rel)}` : ""}
            </span>
            <title>{`${r.year}: ${fmt(Math.round(r.total))} hotspots${r.rel !== null ? `, ${fmtPercent(r.rel)} vs average year` : ""}`}</title>
          </button>
        </li>
      ))}
    </ul>
    </>
  );
}
