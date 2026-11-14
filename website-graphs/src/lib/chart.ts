import { MUTED, TEXT } from "./color";

// Shared SVG text tokens: fixed px sizes so type never scales with the card.
export const TICK = { size: 12, fill: MUTED, weight: 400 } as const;
export const AXIS = { size: 12, fill: MUTED, weight: 400 } as const;
export const VALUE = { size: 12, fill: TEXT, weight: 600 } as const;
export const NOTE = { size: 12, fill: MUTED, weight: 400 } as const;

/** Compact tick labels: 1.2k, 12k, 1.3M. */
export function fmtTick(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return String(Math.round(value));
  if (abs < 1_000_000) {
    const k = value / 1000;
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  const m = value / 1_000_000;
  return `${m >= 100 ? Math.round(m) : Math.round(m * 10) / 10}M`;
}

/** Label every Nth item so ~labelPx-wide labels never collide. */
export function thinBy(slotPx: number, labelPx = 24): number {
  return slotPx >= labelPx ? 1 : Math.ceil(labelPx / slotPx);
}
