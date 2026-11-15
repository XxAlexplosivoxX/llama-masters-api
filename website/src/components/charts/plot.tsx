import { motion, useReducedMotion } from "motion/react";
import { fmtTick } from "../../lib/seasonal";

export const H = 156, LEFT = 44, RIGHT = 18, TOP = 10, BOTTOM = 132;
export const MUTED = "var(--color-muted)", TEXT = "var(--color-text)", FOCUS = "var(--color-nasa-red)";
export const transition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

export function Line({ d, color, dashed = false }: { d: string; color: string; dashed?: boolean }) {
  const reduced = useReducedMotion();
  return <motion.path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round"
    strokeDasharray={dashed ? "4 3" : undefined}
    initial={reduced || dashed ? { opacity: 0 } : { pathLength: 0 }} animate={{ opacity: 1, pathLength: 1 }} transition={transition} />;
}

export function YAxis({ width, ticks, y }: { width: number; ticks: number[]; y: (value: number) => number }) {
  return <>{ticks.map((tick) => <g key={tick}>
    <line x1={LEFT} x2={width - RIGHT} y1={y(tick)} y2={y(tick)} stroke="var(--color-border)" />
    <text x={LEFT - 6} y={y(tick) + 4} textAnchor="end" fill={MUTED} fontSize={11}>{fmtTick(tick)}</text>
  </g>)}</>;
}

export function Key({ color, children, band = false }: { color: string; children: React.ReactNode; band?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><span className={band ? "h-2 w-3 opacity-25" : "h-0.5 w-3"}
    style={{ background: color }} />{children}</span>;
}

export function path(points: { x: number; y: number | null }[]) {
  let connected = false;
  return points.map((p) => {
    if (p.y === null) { connected = false; return ""; }
    const command = connected ? "L" : "M";
    connected = true;
    return `${command}${p.x},${p.y}`;
  }).join("");
}
