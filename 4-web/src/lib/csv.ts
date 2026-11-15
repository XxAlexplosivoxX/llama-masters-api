import Papa from "papaparse";
import type { Range, Stats } from "./series";
import type { Hotspot, MonthlySeries } from "./types";

export function download(name: string, rows: object[]) {
  const blob = new Blob([Papa.unparse(rows)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** `extra` adds one column per series (raw MODIS, the record, where it came from) so the harmonization can be inspected. */
export function monthlyRows(
  series: MonthlySeries,
  stats: Stats,
  range: Range,
  area: string,
  extra: Record<string, (number | string | null)[]> = {},
) {
  const rows = [];
  for (let m = range.from; m <= range.to; m++) {
    const value = series.values[m];
    const clim = stats.climatology[m % 12];
    const comparable = value !== null && !series.partial[m] && clim !== null && clim > 0;
    rows.push({
      area,
      year: series.startYear + Math.floor(m / 12),
      month: (m % 12) + 1,
      detections: value ?? "",
      status: value === null ? "no source data" : series.partial[m] ? "partial month" : "complete",
      multi_year_average: clim === null ? "" : Math.round(clim * 10) / 10,
      anomaly_percent: comparable ? Math.round((value! / clim! - 1) * 1000) / 10 : "",
      source: series.source,
      provisional: series.provisionalFrom !== undefined && m >= series.provisionalFrom,
      ...Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [
          k,
          typeof v[m] === "number" ? Math.round((v[m] as number) * 10) / 10 : (v[m] ?? ""),
        ]),
      ),
    });
  }
  return rows;
}

export function hotspotRows(points: Hotspot[]) {
  return points.map((p) => ({
    latitude: p.lat,
    longitude: p.lon,
    acquired_utc: p.acquired_utc,
    platform: p.platform,
    instrument: p.platform === "Terra" || p.platform === "Aqua" ? "MODIS" : "VIIRS",
    confidence: p.confidence,
    frp_mw: p.frp,
    state: p.state ?? "",
  }));
}

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
