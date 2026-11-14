import { motion } from "motion/react";
import { useState } from "react";
import { SENSOR } from "../lib/color";
import { fmt, fmtCompact, fmtPercent } from "../lib/format";
import { coverage } from "../lib/series";
import type { MonthlyGrid, SeriesKind } from "../lib/types";
import type { Explorer } from "../state";

export const EQ_COLOR = "#E8ECF5";
export const KIND_COLOR: Record<SeriesKind, string> = { MODIS: SENSOR.MODIS.color, VIIRS: SENSOR.VIIRS.color, MODIS_EQ: EQ_COLOR };

const OPTIONS: { kind: SeriesKind; title: string; sub: string }[] = [
  { kind: "MODIS", title: "MODIS", sub: "Terra + Aqua, 1 km" },
  { kind: "VIIRS", title: "VIIRS", sub: "Suomi NPP, 375 m" },
  { kind: "MODIS_EQ", title: "Harmonized", sub: "VIIRS on MODIS scale" },
];

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function Swatch({ kind, size = 10 }: { kind: SeriesKind; size?: number }) {
  if (kind !== "MODIS_EQ") return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: KIND_COLOR[kind] }} aria-hidden />;
  // Harmonized: VIIRS data carried onto the MODIS scale, drawn as both colours meeting.
  return (
    <span className="inline-block shrink-0 rounded-full" aria-hidden
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${SENSOR.VIIRS.color} 50%, ${SENSOR.MODIS.color} 50%)` }} />
  );
}

export function SensorSwitch({ explorer, grid }: { explorer: Explorer; grid: MonthlyGrid }) {
  const { kind, setKind, harmonization } = explorer;
  const cov = coverage(grid, kind);
  const check = harmonization?.check;
  const test = grid.harmonization.test;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-bg/60 p-1" role="radiogroup" aria-label="Which satellite record">
        {OPTIONS.map((o) => {
          const active = o.kind === kind;
          return (
            <button key={o.kind} role="radio" aria-checked={active} onClick={() => setKind(o.kind)}
              className={`relative rounded-lg px-2 py-2 text-left transition-colors ${active ? "text-text" : "text-muted hover:text-text"}`}>
              {active && <motion.span layoutId="sensor" className="absolute inset-0 rounded-lg bg-surface-2 ring-1 ring-border" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
              <span className="relative flex items-center gap-1.5 text-sm font-semibold"><Swatch kind={o.kind} />{o.title}</span>
              <span className="relative mt-0.5 block text-2xs leading-tight text-muted">{o.sub}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {kind === "MODIS_EQ" ? (
          <>VIIRS counts rescaled to what MODIS would likely report, fitted on {grid.harmonization.train_years.join("–")}.{" "}
            {check
              ? <>Checked against real MODIS here for {check.years.join("–")} (not used in the fit): off by <span className="num text-text">{Math.round(check.wape * 100)}%</span> month to month, {fmtPercent(check.bias)} overall.</>
              : <>Country-wide test on {test.years.join("–")}: off by <span className="num text-text">{Math.round(test.model.wape * 100)}%</span> month to month.</>}
          </>
        ) : (
          <>{cov.info.series}. Data from {day(cov.info.first_source_day)} to {day(cov.info.last_source_day)}.</>
        )}
        {cov.info.provisional_from_day && <> Since {day(cov.info.provisional_from_day)} the data is near-real-time and may still change.</>}
      </p>
    </div>
  );
}

const W = 400, H = 150, L = 34, R = 8, T = 10, B = 22;

/** Annual totals for the selection: raw MODIS, raw VIIRS and MODIS-equivalent, with the held-out years shaded. */
export function SensorCompare({ explorer, grid }: { explorer: Explorer; grid: MonthlyGrid }) {
  const rows = explorer.harmonization?.annual ?? [];
  const [hover, setHover] = useState<number | null>(null);
  if (rows.length < 2) return <p className="text-xs text-muted">Both sensors need full years in this range to be compared.</p>;

  const max = Math.max(1, ...rows.flatMap((r) => [r.MODIS, r.VIIRS, r.MODIS_EQ]));
  const x = (i: number) => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (k: SeriesKind) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join("");
  const [testFrom, testTo] = grid.harmonization.test_years;
  const ti0 = rows.findIndex((r) => r.year === testFrom), ti1 = rows.findIndex((r) => r.year === testTo);
  const ratio = rows.reduce((s, r) => s + r.VIIRS, 0) / Math.max(1, rows.reduce((s, r) => s + r.MODIS, 0));
  const h = hover !== null ? rows[hover] : null;
  const test = grid.harmonization.test;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(["MODIS", "VIIRS", "MODIS_EQ"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden><path d="M1 4H17" stroke={KIND_COLOR[k]} strokeWidth="2" strokeDasharray={k === "VIIRS" ? "3 2" : undefined} /></svg>
            {k === "MODIS_EQ" ? "Harmonized" : k}
            {h && <span className="num text-text">{fmt(Math.round(h[k]))}</span>}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" data-vaul-no-drag=""
        aria-label={`Yearly detections ${rows[0].year} to ${rows.at(-1)!.year} for MODIS, VIIRS and the harmonized series`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          setHover(Math.max(0, Math.min(rows.length - 1, Math.round(((px - L) / (W - L - R)) * (rows.length - 1)))));
        }}>
        {ti0 >= 0 && ti1 >= 0 && (
          <g>
            <rect x={x(ti0) - 4} y={T} width={x(ti1) - x(ti0) + 8} height={H - T - B} fill="#4C8DFF" opacity="0.07" rx="4" />
            <text x={x(ti0)} y={T + 10} fontSize="9" fill="#9AA6C0">Held-out test years</text>
          </g>
        )}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="#2A3350" strokeWidth="1" />
            <text x={L - 5} y={y(max * f) + 3} fontSize="9" fill="#9AA6C0" textAnchor="end" className="num">{fmtCompact(Math.round(max * f))}</text>
          </g>
        ))}
        {rows.map((r, i) => (i % Math.ceil(rows.length / 7) === 0 || i === rows.length - 1) && (
          <text key={r.year} x={x(i)} y={H - 6} fontSize="9" fill="#9AA6C0" textAnchor="middle" className="num">{r.year}</text>
        ))}
        {(["VIIRS", "MODIS", "MODIS_EQ"] as const).map((k, n) => (
          <motion.path key={`${k}-${explorer.selectionLabel}`} d={path(k)} fill="none" stroke={KIND_COLOR[k]}
            strokeWidth={k === "MODIS_EQ" ? 2 : 1.6} strokeDasharray={k === "VIIRS" ? "4 3" : undefined}
            strokeLinejoin="round" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: n * 0.15, ease: [0.22, 1, 0.36, 1] }} />
        ))}
        {h && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#9AA6C0" strokeDasharray="2 2" />
            {(["MODIS", "VIIRS", "MODIS_EQ"] as const).map((k) => <circle key={k} cx={x(hover)} cy={y(h[k])} r="3" fill={KIND_COLOR[k]} />)}
            <text x={Math.min(x(hover) + 4, W - 30)} y={H - B - 4} fontSize="10" fill="#E8ECF5" className="num">{h.year}</text>
          </g>
        )}
      </svg>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Raw VIIRS reads about <span className="num text-text">{ratio.toFixed(1)}×</span> MODIS here because its pixels are smaller, not because there is more fire.
        Country-wide, on {test.years.join("–")}, the harmonized series is off by{" "}
        <span className="num text-text">{Math.round(test.model.wape * 100)}%</span> month to month, against{" "}
        <span className="num">{Math.round(test.single_ratio.wape * 100)}%</span> for a single fixed ratio.
      </p>
    </div>
  );
}
