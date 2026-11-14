import type { BBox } from "./types";

export type Axis = "lat" | "lon";
export type Parsed = { value: number; error?: undefined } | { value?: undefined; error: string };

const LIMIT = { lat: 85, lon: 180 } as const;
const HEMI = { lat: { N: 1, S: -1 }, lon: { E: 1, W: -1 } } as const;

/** Decimal degrees with optional hemisphere letter: "-9.5", "9,5 S", "55.5°W", "−12". */
export function parseDegrees(raw: string, axis: Axis): Parsed {
  const name = axis === "lat" ? "latitude" : "longitude";
  let text = raw.trim().replace(/[\u2212\u2013\u2014]/g, "-").replace(/°/g, "").replace(/\s+/g, "");
  if (!text) return { error: `Enter a ${name}.` };
  let sign = 1;
  const letter = text.slice(-1).toUpperCase();
  if (/[NSEW]/.test(letter)) {
    const hemi = HEMI[axis] as Record<string, number>;
    if (!(letter in hemi)) return { error: axis === "lat" ? "Latitude uses N or S." : "Longitude uses E or W." };
    if (text.startsWith("-")) return { error: "Use a minus sign or a letter, not both." };
    sign = hemi[letter];
    text = text.slice(0, -1);
  }
  if (/^-?\d+,\d+$/.test(text)) text = text.replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return { error: "Use decimal degrees, e.g. -9.5 or 9.5 S." };
  const value = sign * Number(text);
  if (Math.abs(value) > LIMIT[axis]) return { error: `${axis === "lat" ? "Latitude" : "Longitude"} goes from -${LIMIT[axis]} to ${LIMIT[axis]}.` };
  return { value };
}

export function parseNumber(raw: string, { min, max, unit }: { min: number; max: number; unit: string }): Parsed {
  const text = raw.trim().replace(/[\u2212]/g, "-").replace(/(\d),(\d{3})\b/g, "$1$2").replace(",", ".");
  if (!text) return { error: "Enter a distance." };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return { error: "Use a plain number." };
  const value = Number(text);
  if (value < min || value > max) return { error: `Use ${min.toLocaleString("en")} to ${max.toLocaleString("en")} ${unit}.` };
  return { value };
}

export const overlaps = (a: BBox, b: BBox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;
export const describeBBox = (b: BBox) =>
  `lat ${deg(b[1], "N", "S")} to ${deg(b[3], "N", "S")}, lon ${deg(b[0], "E", "W")} to ${deg(b[2], "E", "W")}`;
export const fmtPoint = (lat: number, lon: number) => `${deg(lat, "N", "S")}, ${deg(lon, "E", "W")}`;
