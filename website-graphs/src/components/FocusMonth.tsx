import { AXIS, NOTE, VALUE } from "../lib/chart";
import { GRID, HARMONIZED, MODIS, MODIS_EQ, MUTED, SENSOR, VIIRS } from "../lib/color";
import { fmt } from "../lib/format";
import { harmonizedSource, MONTHS_LONG, weeklyToMonthly } from "../lib/shared";
import { csvMonthly } from "../lib/csv";
import { INSTRUMENT, RESOLUTION, type MonthlySeries, type Platform, type SeriesKind } from "../types";
import { useWidth } from "../hooks/useWidth";
import type { PlaceData } from "../hooks/usePlaceData";
import { useGraphsStore } from "../hooks/useGraphsStore";

interface Props {
  data: PlaceData;
  month: number | null; // month index into the series
}

const ROW = 30;
const LABEL = 132;
const VALUE_W = 64;

interface Bar { key: string; label: string; note?: string; value: number | null; color: string }

/** The focus month side by side by record; raw counts are never summed. */
export function FocusMonth({ data, month }: Props) {
  const { ref, width } = useWidth();
  const { loaded, values, cells, series, csvData, platforms } = data;
  const areaId = useGraphsStore((s) => s.areaId) ?? "upload";

  if (month === null || !series) {
    return <p className="rounded-lg border border-dashed border-grid p-4 text-sm text-muted">Pick a month on the curve or the calendar.</p>;
  }

  let bars: Bar[] = [];
  if (loaded && "grid" in loaded && values) {
    const sum = (kind: SeriesKind) => {
      let v = 0;
      for (const i of cells) v += values[kind][i][month] ?? 0;
      return v;
    };
    const source = harmonizedSource(loaded.grid)[month];
    const note = source === "both" ? "mean of MODIS + converted VIIRS"
      : source ? `only ${source} this month` : "no coverage";
    bars = [
      { key: "modis", label: "MODIS", value: sum("MODIS"), color: MODIS },
      { key: "viirs", label: "VIIRS raw", note: "375 m, not comparable", value: sum("VIIRS"), color: VIIRS },
      { key: "eq", label: "VIIRS on MODIS scale", value: sum("MODIS_EQ"), color: MODIS_EQ },
      { key: "harm", label: "Harmonized", note, value: sum("HARMONIZED"), color: HARMONIZED },
    ];
  } else {
    // Weekly exports and CSVs: one bar per platform, never summed.
    const year = series.startYear + Math.floor(month / 12), cal = month % 12;
    const at = (s: MonthlySeries | null) =>
      s ? s.values[(year - s.startYear) * 12 + cal] ?? null : null;
    bars = platforms.map((p) => {
      const s = loaded && "areas" in loaded
        ? weeklyToMonthly(loaded.weekly, p, areaId)
        : csvData ? csvMonthly(csvData.result, p) : null;
      return {
        key: p, label: p, note: `${INSTRUMENT[p as Platform]} ${RESOLUTION[p as Platform]}`,
        value: at(s), color: SENSOR[p as Platform] ?? MUTED,
      };
    });
  }

  const max = Math.max(1, ...bars.map((b) => b.value ?? 0));
  const height = 8 + bars.length * ROW;
  const label = `${MONTHS_LONG[month % 12]} ${series.startYear + Math.floor(month / 12)}`;
  const track = width - LABEL - VALUE_W;

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block" role="list" aria-label={`${label} by record`}>
          {bars.map((b, i) => {
            const y = 8 + i * ROW;
            const w = b.value !== null ? Math.max(2, (b.value / max) * track) : 0;
            return (
              <g key={b.key}>
                <text x={0} y={y + 10} fontSize={AXIS.size} fill={AXIS.fill}>{b.label}</text>
                {b.note && <text x={0} y={y + 21} fontSize={NOTE.size - 1.5} fill={MUTED}>{b.note}</text>}
                <rect x={LABEL} y={y} width={Math.max(track, 1)} height={ROW - 14} rx={4} fill="none" stroke={GRID} />
                {b.value !== null && <rect x={LABEL} y={y} width={w} height={ROW - 14} rx={4} fill={b.color} />}
                <text x={width} y={y + 11} fontSize={VALUE.size} fontWeight={VALUE.weight} fill={VALUE.fill} textAnchor="end">
                  {b.value === null ? "No data" : fmt(Math.round(b.value))}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <p className="mt-1 text-2xs leading-snug text-muted">Raw counts are never added together.</p>
    </div>
  );
}
