import Papa from "papaparse";
import type { BBox } from "../state";
import type { MonthlySeries } from "../types";
import { gridSeries, type Range } from "./shared";
import type { PlaceData } from "../hooks/usePlaceData";
import { sensorOf } from "./color";

export const COUNT_NOTE = "counts are quality-filtered satellite hotspot pixels, not fires or burned area";

const ym = (startYear: number, m: number) =>
  `${startYear + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
const cell = (v: number | null | undefined) => (v == null ? "" : Math.round(v * 100) / 100);

function save(name: string, text: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/**
 * Monthly series in the visible range. Grid places get every record for the same cells;
 * single-satellite series fill only the column of their instrument. Nulls stay empty.
 */
export function monthlyCsvRows(data: PlaceData, series: MonthlySeries, range: Range, platform: string) {
  const { loaded, values, cells } = data;
  const cols: Record<"harmonized" | "modis" | "viirs_raw" | "viirs_modis_equivalent", (number | null)[] | null> = {
    harmonized: null, modis: null, viirs_raw: null, viirs_modis_equivalent: null,
  };
  if (loaded && "grid" in loaded && values) {
    const g = loaded.grid;
    cols.harmonized = gridSeries(g, values.HARMONIZED, cells, "HARMONIZED").values;
    cols.modis = gridSeries(g, values.MODIS, cells, "MODIS").values;
    cols.viirs_raw = gridSeries(g, values.VIIRS, cells, "VIIRS").values;
    cols.viirs_modis_equivalent = gridSeries(g, values.MODIS_EQ, cells, "MODIS_EQ").values;
  } else {
    cols[sensorOf(platform) === "MODIS" ? "modis" : "viirs_raw"] = series.values;
  }
  const rows = [];
  for (let m = range.from; m <= range.to; m++) {
    rows.push({
      month: ym(series.startYear, m),
      harmonized: cell(cols.harmonized?.[m]),
      modis: cell(cols.modis?.[m]),
      viirs_raw: cell(cols.viirs_raw?.[m]),
      viirs_modis_equivalent: cell(cols.viirs_modis_equivalent?.[m]),
      partial: series.values[m] === null ? "" : series.partial[m],
      provisional: series.values[m] === null ? "" : series.provisionalFrom !== undefined && m >= series.provisionalFrom,
    });
  }
  return rows;
}

export interface ExportMeta {
  place: string;
  bbox: BBox | null;
  range: string;
  series: string;
  source: string;
}

/** CSV with a `#`-prefixed metadata header (pandas: `read_csv(..., comment="#")`). */
export function downloadMonthlyCsv(name: string, meta: ExportMeta, rows: object[]) {
  const header = [
    `place: ${meta.place}`,
    `bbox_west_south_east_north: ${meta.bbox ? meta.bbox.join(",") : "whole place"}`,
    `range: ${meta.range}`,
    `series: ${meta.series}`,
    `source: ${meta.source}`,
    `generated_at_utc: ${new Date().toISOString()}`,
    `note: ${COUNT_NOTE}`,
    "partial/provisional describe the selected series; empty cells mean no source data, never zero",
  ].map((line) => `# ${line.replace(/[\r\n]+/g, " ")}`).join("\n");
  save(`${name}.csv`, `${header}\n${Papa.unparse(rows)}\n`, "text/csv;charset=utf-8");
}

/** Standalone SVG of a chart, with a solid background and a caption so it reads outside the app. */
export function downloadSvg(name: string, svg: SVGSVGElement, caption: string, background: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const width = Number(svg.getAttribute("width")), height = Number(svg.getAttribute("height"));
  const ns = "http://www.w3.org/2000/svg";
  clone.setAttribute("xmlns", ns);
  clone.setAttribute("height", String(height + 24));
  clone.setAttribute("viewBox", `0 0 ${width} ${height + 24}`);
  clone.setAttribute("font-family", "Public Sans, system-ui, sans-serif");
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", background);
  clone.insertBefore(bg, clone.firstChild);
  const text = document.createElementNS(ns, "text");
  text.setAttribute("x", "4"); text.setAttribute("y", String(height + 16));
  text.setAttribute("font-size", "11"); text.setAttribute("fill", "#94A3B8");
  text.textContent = caption;
  clone.appendChild(text);
  save(`${name}.svg`, new XMLSerializer().serializeToString(clone), "image/svg+xml");
}
