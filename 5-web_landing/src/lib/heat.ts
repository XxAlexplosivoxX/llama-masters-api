// The atlas's heat ramp (magma, --color-heat-1…6 in styles.css) as a function, for canvas and SVG.
const STOPS = ["#3b0f70", "#721f81", "#b73779", "#f1605d", "#feaf77", "#fcfdbf"].map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]);

/** Colour for a share of the maximum, 0..1. Square root, so quiet months stay visible. */
export function heat(share: number): string {
  const t = Math.sqrt(Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0))) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const c = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const short = (v: number) => compact.format(v);
