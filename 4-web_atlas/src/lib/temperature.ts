import { sensorOf } from "./color";
import type { Hotspot, MonthlyGrid } from "./types";

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
  sensor: TempSensor | "HARMONIZED";
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

/** What a grid temperature frame shows: one sensor's own readings, or the harmonized record. */
export type GridTempKind = TempSensor | "HARMONIZED";

/** Per cell: months with a temperature, the temperature (K, VIIRS scale) and its weight (detections). */
interface HarmonizedTemps {
  months: Int32Array[];
  temps: Float32Array[];
  weights: Float32Array[];
  /** MODIS K → VIIRS-scale K. */
  toViirs: (kelvin: number) => number;
  /** Cell-months where both sensors have a temperature (the fit). */
  pairs: number;
  scale: TempScale;
}

const QUANTILES = 101;

const quantile = (sorted: Float64Array, p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;

/**
 * Quantile mapping of MODIS onto the VIIRS scale: the p-th percentile of MODIS becomes the p-th
 * percentile of VIIRS. Fitted on the cell-months where both have a temperature (2012 on); with
 * fewer than 200 of those, on all readings of each sensor. Outside the fitted range it clamps,
 * which also respects the VIIRS I4 ceiling near 367 K.
 */
function quantileMap(grid: MonthlyGrid): { toViirs: (k: number) => number; pairs: number } {
  const modis: number[] = [];
  const viirs: number[] = [];
  for (const c of grid.cells) {
    const a = c[4],
      b = c[5];
    // Both columns are sorted by month: walk them together.
    for (let i = 0, j = 0; i < a.length && j < b.length;) {
      if (a[i] < b[j]) i += 2;
      else if (a[i] > b[j]) j += 2;
      else {
        if (a[i + 1] > 0 && b[j + 1] > 0) {
          modis.push(a[i + 1]);
          viirs.push(b[j + 1]);
        }
        i += 2;
        j += 2;
      }
    }
  }
  const pairs = modis.length;
  if (pairs < 200) {
    modis.length = viirs.length = 0;
    for (const c of grid.cells) {
      for (let i = 1; i < c[4].length; i += 2) if (c[4][i] > 0) modis.push(c[4][i]);
      for (let i = 1; i < c[5].length; i += 2) if (c[5][i] > 0) viirs.push(c[5][i]);
    }
    if (!modis.length || !viirs.length) return { toViirs: (k) => k, pairs };
  }
  const sm = Float64Array.from(modis).sort(),
    sv = Float64Array.from(viirs).sort();
  const qm = Array.from({ length: QUANTILES }, (_, i) => quantile(sm, i / (QUANTILES - 1)));
  const qv = Array.from({ length: QUANTILES }, (_, i) => quantile(sv, i / (QUANTILES - 1)));
  const toViirs = (k: number) => {
    if (k <= qm[0]) return qv[0];
    if (k >= qm[QUANTILES - 1]) return qv[QUANTILES - 1];
    let lo = 0,
      hi = QUANTILES - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (qm[mid] <= k) lo = mid;
      else hi = mid;
    }
    // Ties (MODIS is whole kelvin): the last quantile at this value, then interpolate to the next.
    const span = qm[hi] - qm[lo];
    return span > 0 ? qv[lo] + ((qv[hi] - qv[lo]) * (k - qm[lo])) / span : qv[lo];
  };
  return { toViirs, pairs };
}

const harmonizedCache = new WeakMap<MonthlyGrid, HarmonizedTemps>();

/**
 * One temperature record on the VIIRS scale, like the detections: VIIRS where it covers the month,
 * MODIS mapped onto VIIRS before (and in a cell VIIRS missed). Computed once per grid.
 */
export function harmonizedTemps(grid: MonthlyGrid): HarmonizedTemps {
  const cached = harmonizedCache.get(grid);
  if (cached) return cached;
  const { toViirs, pairs } = quantileMap(grid);
  const viirsMonth = viirsMonths(grid);
  const months: Int32Array[] = [],
    temps: Float32Array[] = [],
    weights: Float32Array[] = [];
  let total = 0;
  for (const c of grid.cells) {
    // Months of either sensor, in order: VIIRS where it covers the month, else MODIS mapped.
    const a = c[4],
      b = c[5],
      n = c[3];
    const ms: number[] = [],
      ts: number[] = [],
      ws: number[] = [];
    let i = 0,
      j = 0,
      k = 0;
    while (i < a.length || j < b.length) {
      const m = Math.min(i < a.length ? a[i] : Infinity, j < b.length ? b[j] : Infinity);
      const mt = i < a.length && a[i] === m ? a[i + 1] : 0;
      const vt = j < b.length && b[j] === m ? b[j + 1] : 0;
      if (i < a.length && a[i] === m) i += 2;
      if (j < b.length && b[j] === m) j += 2;
      const t = vt > 0 && viirsMonth[m] ? vt : mt > 0 ? toViirs(mt) : 0;
      if (t <= 0) continue;
      while (k < n.length && n[k] < m) k += 2;
      ms.push(m);
      ts.push(t);
      ws.push(Math.max(k < n.length && n[k] === m ? n[k + 1] : 1, 1e-3));
    }
    months.push(Int32Array.from(ms));
    temps.push(Float32Array.from(ts));
    weights.push(Float32Array.from(ws));
    total += ts.length;
  }
  const all = new Float64Array(total);
  let at = 0;
  for (const ts of temps) {
    all.set(ts, at);
    at += ts.length;
  }
  all.sort();
  const lo = quantile(all, 0.02);
  const result: HarmonizedTemps = {
    months,
    temps,
    weights,
    toViirs,
    pairs,
    scale: { sensor: "HARMONIZED", lo, hi: Math.max(quantile(all, 0.98), lo + 1) },
  };
  harmonizedCache.set(grid, result);
  return result;
}

/** Harmonized mean temperature per shown cell over `from..to` (0 = no fires), weighted by detections. */
export function harmonizedCellTemps(h: HarmonizedTemps, shown: number[], from: number, to: number): number[] {
  return shown.map((i) => {
    const ms = h.months[i],
      ts = h.temps[i],
      ws = h.weights[i];
    let sum = 0,
      weight = 0;
    for (let j = 0; j < ms.length; j++) {
      if (ms[j] < from) continue;
      if (ms[j] > to) break;
      sum += ts[j] * ws[j];
      weight += ws[j];
    }
    return weight ? sum / weight : 0;
  });
}
