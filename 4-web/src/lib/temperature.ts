import { sensorOf } from "./color";
import type { Hotspot, MonthlyGrid, SeriesKind } from "./types";

/**
 * Brightness temperature: how hot the satellite pixel looks (kelvin), not the flame itself.
 * MODIS (bands 21/22) and VIIRS (I4, which saturates near 367 K) measure it differently, so each
 * sensor gets its own colour scale and the two are never compared on one scale.
 */
export type TempUnit = "K" | "C" | "F";
export type TempSensor = "MODIS" | "VIIRS";
export type Metric = "count" | "temperature";

export const UNIT_LABEL: Record<TempUnit, string> = { K: "K", C: "°C", F: "°F" };

export function convert(kelvin: number, unit: TempUnit): number {
  if (unit === "C") return kelvin - 273.15;
  if (unit === "F") return ((kelvin - 273.15) * 9) / 5 + 32;
  return kelvin;
}

export const fmtTemp = (kelvin: number, unit: TempUnit) => `${Math.round(convert(kelvin, unit))} ${UNIT_LABEL[unit]}`;

/** Yellow (cooler) to deep red (hotter): kept apart from the purple-to-cream detections ramp. */
export const TEMP = ["#FFF2AE", "#FECB52", "#FD8D3C", "#E8452C", "#B5172D", "#6B0A2E"];

export interface TempScale {
  sensor: TempSensor;
  lo: number; // K
  hi: number; // K
}

function percentile(sorted: number[], p: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
}

/** Each sensor's colour range: the 2nd to 98th percentile of its cell-month means, fixed for the place. */
export function tempScales(grid: MonthlyGrid): Record<TempSensor, TempScale> {
  const collect = (k: 4 | 5) => {
    const all: number[] = [];
    for (const c of grid.cells) for (let i = 1; i < c[k].length; i += 2) if (c[k][i] > 0) all.push(c[k][i]);
    return all.sort((a, b) => a - b);
  };
  const scale = (sensor: TempSensor, sorted: number[]): TempScale => {
    const lo = percentile(sorted, 0.02),
      hi = percentile(sorted, 0.98);
    return { sensor, lo, hi: Math.max(hi, lo + 1) };
  };
  return { MODIS: scale("MODIS", collect(4)), VIIRS: scale("VIIRS", collect(5)) };
}

const viirsCache = new WeakMap<MonthlyGrid, boolean[]>();

/** Whether a month has VIIRS temperatures in the grid (any cell); computed once per grid. */
function viirsMonths(grid: MonthlyGrid): boolean[] {
  let has = viirsCache.get(grid);
  if (!has) {
    has = Array<boolean>(grid.months).fill(false);
    for (const c of grid.cells) for (let i = 0; i < c[5].length; i += 2) has[c[5][i]] = true;
    viirsCache.set(grid, has);
  }
  return has;
}

/**
 * The sensor whose temperatures a frame shows: the view's own sensor for MODIS or VIIRS; for the
 * harmonized view, VIIRS when it covers the month (or, for a date range, its last month), else MODIS.
 */
export function sensorFor(grid: MonthlyGrid, kind: SeriesKind, month: number): TempSensor {
  if (kind === "MODIS") return "MODIS";
  if (kind === "VIIRS") return "VIIRS";
  return viirsMonths(grid)[month] ? "VIIRS" : "MODIS";
}

/**
 * Mean temperature per shown cell (0 = no fires): one month, or the mean over `from..to`
 * weighted by each month's detections of that sensor.
 */
export function cellTemps(grid: MonthlyGrid, sensor: TempSensor, shown: number[], from: number, to: number): number[] {
  const k = sensor === "MODIS" ? 4 : 5;
  return shown.map((i) => {
    const temps = grid.cells[i][k];
    const counts = sensor === "MODIS" ? grid.cells[i][2] : null; // MODIS: same months as its counts
    let sum = 0,
      weight = 0;
    for (let j = 0; j < temps.length; j += 2) {
      const m = temps[j];
      if (m < from || m > to || temps[j + 1] <= 0) continue;
      const w = counts ? (counts[j + 1] ?? 1) : 1;
      sum += temps[j + 1] * w;
      weight += w;
    }
    return weight ? sum / weight : 0;
  });
}

/** Each sensor's colour range over the last 7 days of points (2nd to 98th percentile), or null without temperatures. */
export function recentScales(points: Hotspot[]): Record<TempSensor, TempScale> | null {
  const by: Record<TempSensor, number[]> = { MODIS: [], VIIRS: [] };
  for (const p of points) if (p.bright != null && p.bright > 0) by[sensorOf(p.platform)].push(p.bright);
  if (!by.MODIS.length && !by.VIIRS.length) return null;
  const scale = (sensor: TempSensor): TempScale => {
    const sorted = by[sensor].sort((a, b) => a - b);
    const lo = percentile(sorted, 0.02),
      hi = percentile(sorted, 0.98);
    return { sensor, lo, hi: Math.max(hi, lo + 1) };
  };
  return { MODIS: scale("MODIS"), VIIRS: scale("VIIRS") };
}
