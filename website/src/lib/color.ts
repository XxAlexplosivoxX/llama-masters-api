import { scaleDiverging, scaleSequentialSqrt } from "d3-scale";
import { interpolateRgbBasis } from "d3-interpolate";

// Mirrors the --heat-* and --anom-* tokens in styles.css (magma and RdBu, colour-blind safe).
export const HEAT = ["#3B0F70", "#721F81", "#B73779", "#F1605D", "#FEAF77", "#FCFDBF"];
export const HEAT_ZERO = "#1B2338";
export const ANOM = ["#2C7BB6", "#ABD9E9", "#D9DEE8", "#FDAE61", "#D7191C"];

const heat = interpolateRgbBasis(HEAT);
const anom = interpolateRgbBasis(ANOM);

/** Square-root scale so one record month does not flatten every other month. */
export function heatScale(max: number) {
  const scale = scaleSequentialSqrt(heat).domain([0, Math.max(max, 1)]);
  return (value: number) => (value <= 0 ? HEAT_ZERO : scale(value));
}

/** Relative anomaly (value / average - 1), clamped to ±100 %. */
export function anomalyScale(limit = 1) {
  const scale = scaleDiverging(anom).domain([-limit, 0, limit]).clamp(true);
  return (relative: number) => scale(relative);
}

/** Sensor identity colours (--color-modis / --color-viirs), kept apart from the heat ramp. */
export type Sensor = "MODIS" | "VIIRS";
export const SENSOR: Record<Sensor, { color: string; pixel: string; satellites: string }> = {
  MODIS: { color: "#FFB547", pixel: "1 km pixels", satellites: "Terra, Aqua" },
  VIIRS: { color: "#3DD6D0", pixel: "375 m pixels", satellites: "S-NPP, NOAA-20, NOAA-21" },
};
export const sensorOf = (platform: string): Sensor => (platform === "Terra" || platform === "Aqua" ? "MODIS" : "VIIRS");
