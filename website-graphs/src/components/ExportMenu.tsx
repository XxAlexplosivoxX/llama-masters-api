import { Download } from "lucide-react";
import { useState } from "react";
import { useGraphsStore } from "../hooks/useGraphsStore";
import { useKeepInView } from "../hooks/useKeepInView";
import type { PlaceData } from "../hooks/usePlaceData";
import { BG } from "../lib/color";
import { COUNT_NOTE, downloadMonthlyCsv, downloadSvg, monthlyCsvRows } from "../lib/export";
import { labelOf, SERIES_LABEL, slug } from "../lib/shared";

/** Calendar SVGs opt in with this attribute so the export finds them without prop drilling. */
export const CALENDAR_EXPORT = "data-export-calendar";

export function ExportMenu({ data }: { data: PlaceData }) {
  const platform = useGraphsStore((s) => s.platform);
  const [open, setOpen] = useState(false);
  const menu = useKeepInView(open);
  const { series, range, bbox, loaded } = data;
  if (!series || !range) return null;

  const placeLabel = data.isCsv ? data.csv?.name ?? "upload" : data.place?.label ?? "place";
  const rangeLabel = `${labelOf(series.startYear, range.from)} – ${labelOf(series.startYear, range.to)}`;
  const grid = loaded && "grid" in loaded;
  const seriesLabel = grid ? SERIES_LABEL[series.kind ?? "HARMONIZED"] : platform;
  const name = slug(`${placeLabel}-${bbox ? "bbox" : "all"}-${seriesLabel}-${rangeLabel}`);

  const csv = () => downloadMonthlyCsv(name, {
    place: placeLabel, bbox, range: rangeLabel, series: seriesLabel, source: series.source,
  }, monthlyCsvRows(data, series, range, platform));

  const svg = () => {
    const el = document.querySelector<SVGSVGElement>(`svg[${CALENDAR_EXPORT}]`);
    if (el) downloadSvg(`${name}-calendar`, el, `${placeLabel}${bbox ? ` [${bbox.join(", ")}]` : ""} · ${seriesLabel} · ${COUNT_NOTE}`, BG);
  };

  return (
    <details className="relative" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="field inline-flex cursor-pointer list-none items-center gap-2 font-medium text-text hover:border-muted">
        <Download size={15} aria-hidden /> Download
      </summary>
      <div ref={menu} className="absolute right-0 z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-grid bg-card p-1.5 shadow-xl" role="menu">
        <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800" onClick={csv}>
          Monthly CSV
          <span className="block text-xs text-muted">{rangeLabel}, with metadata header</span>
        </button>
        <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800" onClick={svg}>
          Calendar image (SVG)
          <span className="block text-xs text-muted">As shown, with caption</span>
        </button>
      </div>
    </details>
  );
}
