import Papa from "papaparse";
import { SERIES_LABEL, type Range, type Stats } from "./series";
import type { Hotspot, MonthlySeries } from "./types";

export function download(name: string, rows: object[]) {
  // The BOM makes Excel read UTF-8 (accents in place and state names).
  const blob = new Blob(["\uFEFF" + Papa.unparse(rows)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Converted months are estimates with fractions; whole hotspots read better and lose nothing meaningful. */
const whole = (v: number | string | null | undefined) => (typeof v === "number" ? Math.round(v) : (v ?? ""));

/** `extra` adds one column per series (raw MODIS, the record, where it came from) so the harmonization can be inspected. */
export function monthlyRows(
  series: MonthlySeries,
  stats: Stats,
  range: Range,
  area: string,
  extra: Record<string, (number | string | null)[]> = {},
) {
  const rows = [];
  const view = series.kind ? SERIES_LABEL[series.kind] : series.source;
  for (let m = range.from; m <= range.to; m++) {
    const value = series.values[m];
    const clim = stats.climatology[m % 12];
    const comparable = value !== null && !series.partial[m] && clim !== null && clim > 0;
    rows.push({
      area,
      year: series.startYear + Math.floor(m / 12),
      month: (m % 12) + 1,
      view,
      hotspots: whole(value),
      status: value === null ? "no source data" : series.partial[m] ? "partial month" : "complete",
      month_average: whole(clim),
      vs_average_percent: comparable ? Math.round((value! / clim! - 1) * 1000) / 10 : "",
      provisional: series.provisionalFrom !== undefined && m >= series.provisionalFrom,
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, whole(v[m])])),
    });
  }
  return rows;
}

/** FIRMS reports VIIRS confidence as a letter. */
const VIIRS_CONFIDENCE: Record<string, string> = { l: "low", n: "nominal", h: "high" };

export function hotspotRows(points: Hotspot[]) {
  return points.map((p) => {
    const modis = p.platform === "Terra" || p.platform === "Aqua";
    return {
      date_utc: p.acquired_utc.slice(0, 10),
      time_utc: p.acquired_utc.slice(11, 16),
      latitude: p.lat,
      longitude: p.lon,
      instrument: modis ? "MODIS" : "VIIRS",
      satellite: p.platform,
      modis_confidence_percent: modis ? p.confidence : "",
      viirs_confidence: modis ? "" : (VIIRS_CONFIDENCE[p.confidence] ?? p.confidence),
      fire_power_mw: p.frp,
      brightness_k: p.bright ?? "",
      state: p.state ?? "",
    };
  });
}

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
