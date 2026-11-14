import { scaleDiverging, scaleSequentialSqrt } from "d3-scale";
import { interpolateRgbBasis } from "d3-interpolate";
import type { Platform, SeriesKind } from "../types";

// Mirrors the --color-* tokens in styles.css.
export const BG = "#060D1E";
export const CARD = "#0B1631";
export const GRID = "#1E293B";
export const TEXT = "#E2E8F0";
export const MUTED = "#94A3B8";
export const ALERT = "#F59E0B";

export const MODIS = "#2E96F5";
export const VIIRS = "#E43700";
export const MODIS_EQ = "#FF8A00";
export const HARMONIZED = TEXT;

export const SERIES_COLOR: Record<SeriesKind, string> = {
  HARMONIZED, MODIS, VIIRS, MODIS_EQ,
};

export const FIREFLY = ["#111C35", "#6B1D1B", "#E43700", "#FF8A00", "#FFE66D"];
export const ANOM = ["#2C7BB6", "#ABD9E9", "#D9DEE8", "#FDAE61", "#D7191C"];

const ramp = interpolateRgbBasis(FIREFLY.slice(1));
const anom = interpolateRgbBasis(ANOM);

/** Square-root ramp so one extreme month does not flatten the rest; 0 and null are special. */
export function fireflyScale(max: number) {
  const scale = scaleSequentialSqrt(ramp).domain([0, Math.max(max, 1)]);
  return (value: number | null) => (value === null ? "transparent" : value <= 0 ? FIREFLY[0] : scale(value));
}

/** Relative anomaly (value / average - 1), clamped to ±limit. */
export function anomalyScale(limit = 1) {
  const scale = scaleDiverging(anom).domain([-limit, 0, limit]).clamp(true);
  return (relative: number) => scale(relative);
}

export const SENSOR: Record<Platform, string> = {
  Terra: "#2E96F5",
  Aqua: "#38BDF8",
  "S-NPP": "#E43700",
  "NOAA-20": "#FB923C",
  "NOAA-21": "#FDBA74",
};

export const sensorOf = (platform: string): "MODIS" | "VIIRS" =>
  platform === "Terra" || platform === "Aqua" ? "MODIS" : "VIIRS";
