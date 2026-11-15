import { HARMONIZED, MODIS, MODIS_EQ, MUTED, SENSOR, VIIRS } from "../lib/color";
import { fmt } from "../lib/format";
import { harmonizedSource, MONTHS_LONG, weeklyToMonthly } from "../lib/shared";
import { csvMonthly } from "../lib/csv";
import { INSTRUMENT, RESOLUTION, type MonthlySeries, type Platform, type SeriesKind } from "../types";
import type { PlaceData } from "../hooks/usePlaceData";
import { useGraphsStore } from "../hooks/useGraphsStore";
import { useState } from "react";

interface Props {
  data: PlaceData;
  month: number | null; // month index into the series
}

interface Bar { key: string; label: string; note?: string; value: number | null; color: string }

/** The focus month side by side by record; raw counts are never summed. */
export function FocusMonth({ data, month }: Props) {
  const { loaded, values, cells, series, csvData, platforms } = data;
  const areaId = useGraphsStore((s) => s.areaId) ?? "upload";
  const [showRaw, setShowRaw] = useState(false);
  const isGrid = !!loaded && "grid" in loaded;

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
      ...(showRaw ? [{ key: "viirs", label: "VIIRS raw", note: "375 m, not comparable", value: sum("VIIRS"), color: VIIRS }] : []),
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
  const label = `${MONTHS_LONG[month % 12]} ${series.startYear + Math.floor(month / 12)}`;

  return (
    <div className="@container">
      {/* HTML rows so long labels and notes wrap inside their column instead of running under the bars.
          Narrow cards put the label above its bar so the bar keeps most of the width. */}
      <ul className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 @[22rem]:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] @[22rem]:gap-y-2.5" aria-label={`${label} by record`}>
        {bars.map((b, i) => (
          <li key={b.key} className="contents">
            <span className={`col-span-2 min-w-0 leading-tight @[22rem]:col-span-1 @[22rem]:mt-0 ${i ? "mt-1.5" : ""}`}>
              <span className="block text-sm text-muted">{b.label}</span>
              {b.note && <span className="block text-2xs leading-snug text-muted/80">{b.note}</span>}
            </span>
            <span className="h-4 rounded border border-grid">
              {b.value !== null && (
                <span className="block h-full rounded" style={{ width: `${Math.max(1, (b.value / max) * 100)}%`, background: b.color }} />
              )}
            </span>
            <span className="num text-right text-sm font-semibold text-text">
              {b.value === null ? "No data" : fmt(Math.round(b.value))}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xs leading-snug text-muted">
          Raw counts are never added together.{isGrid ? " Raw VIIRS (375 m) is not comparable with MODIS (1 km)." : " Instruments are not comparable on raw counts."}
        </p>
        {isGrid && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} className="accent-[#F97316]" />
            Show raw VIIRS
          </label>
        )}
      </div>
    </div>
  );
}
