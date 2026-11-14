import { motion } from "motion/react";
import { useState } from "react";
import { SENSOR } from "../lib/color";
import { fmt, fmtCompact, fmtPercent } from "../lib/format";
import type { MonthlyGrid, SeriesKind } from "../lib/types";
import type { Explorer } from "../state";

const LINE: Record<"MODIS" | "VIIRS" | "MODIS_EQ", { color: string; label: string; dash?: string }> = {
  MODIS: { color: SENSOR.MODIS.color, label: "MODIS" },
  VIIRS: { color: SENSOR.VIIRS.color, label: "VIIRS, raw", dash: "4 3" },
  MODIS_EQ: { color: "#E8ECF5", label: "VIIRS on the MODIS scale" },
};

const VIEWS: { kind: SeriesKind; label: string }[] = [
  { kind: "HARMONIZED", label: "Harmonized" },
  { kind: "MODIS", label: "MODIS only" },
  { kind: "VIIRS", label: "VIIRS only" },
];

/** Which record the calendar and map use. Harmonized is the default; single sensors are for checking. */
export function SeriesView({ explorer }: { explorer: Explorer }) {
  const { kind, setKind } = explorer;
  return (
    <div className="seg w-full" role="radiogroup" aria-label="Record shown in the calendar and map">
      {VIEWS.map((v) => (
        <button key={v.kind} role="radio" aria-checked={kind === v.kind} aria-pressed={kind === v.kind}
          className="flex-1 justify-center" onClick={() => setKind(v.kind)}>
          {kind === v.kind && <motion.span layoutId="series-view" className="absolute inset-0 rounded-[9px] bg-surface-2 ring-1 ring-border" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
          <span className="relative">{v.label}</span>
        </button>
      ))}
    </div>
  );
}

const W = 400, H = 150, L = 34, R = 8, T = 10, B = 22;

/** The method in three steps, with the evidence for this area underneath. */
export function HowCombined({ explorer, grid }: { explorer: Explorer; grid: MonthlyGrid }) {
  const rows = explorer.harmonization?.annual ?? [];
  const check = explorer.harmonization?.check;
  const [hover, setHover] = useState<number | null>(null);
  const h = grid.harmonization;
  const ratio = rows.reduce((s, r) => s + r.VIIRS, 0) / Math.max(1, rows.reduce((s, r) => s + r.MODIS, 0));

  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <ol className="space-y-2 text-muted">
        <li><span className="font-semibold text-text">1. Two satellite records.</span>{" "}
          MODIS has looked since 2000 with 1 km pixels; VIIRS since 2012 with 375 m pixels, so it sees smaller fires and splits big ones into more pixels.
          {rows.length > 1 && <> Here VIIRS counts about <span className="num text-text">{ratio.toFixed(1)}×</span> as many hotspots as MODIS for the same fires.</>}
        </li>
        <li><span className="font-semibold text-text">2. One scale.</span>{" "}
          VIIRS counts are converted to the MODIS scale, cell by cell and month by month, using {h.train_years.join("–")}, when both flew.
        </li>
        <li><span className="font-semibold text-text">3. One record.</span>{" "}
          MODIS alone before 2012; from then, the average of MODIS and converted VIIRS. If either satellite stops, the other carries on.
        </li>
      </ol>

      {rows.length > 1 && <Chart rows={rows} testYears={h.test_years} hover={hover} setHover={setHover} label={explorer.selectionLabel} />}

      <p className="text-muted">
        <span className="font-semibold text-text">Checked on years it never saw.</span>{" "}
        For {h.test_years.join("–")}, converted VIIRS was off from real MODIS by{" "}
        {check
          ? <><span className="num text-text">{Math.round(check.wape * 100)}%</span> month to month in this area ({fmtPercent(check.bias)} overall)</>
          : <><span className="num text-text">{Math.round(h.test.model.wape * 100)}%</span> month to month across {grid.label}</>}
        ; raw VIIRS would be off by <span className="num">{Math.round(h.test.raw_viirs.wape * 100)}%</span>.
      </p>

      <div className="space-y-1.5">
        <p className="text-xs text-muted">Show the calendar and map with</p>
        <SeriesView explorer={explorer} />
      </div>
    </div>
  );
}

type Row = { year: number; MODIS: number; VIIRS: number; MODIS_EQ: number };

function Chart({ rows, testYears, hover, setHover, label }: {
  rows: Row[]; testYears: [number, number]; hover: number | null; setHover: (i: number | null) => void; label: string;
}) {
  // Raw VIIRS is left out: at ~4× it would flatten the two lines that should match.
  const max = Math.max(1, ...rows.flatMap((r) => [r.MODIS, r.MODIS_EQ]));
  const x = (i: number) => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (k: keyof typeof LINE) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join("");
  const ti0 = rows.findIndex((r) => r.year === testYears[0]), ti1 = rows.findIndex((r) => r.year === testYears[1]);
  const row = hover !== null ? rows[hover] : null;

  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(["MODIS", "MODIS_EQ"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden><path d="M1 4H17" stroke={LINE[k].color} strokeWidth="2" strokeDasharray={LINE[k].dash} /></svg>
            {LINE[k].label}
            {row && <span className="num text-text">{fmt(Math.round(row[k]))}</span>}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" data-vaul-no-drag=""
        aria-label={`Hotspots per year, ${rows[0].year} to ${rows.at(-1)!.year}: MODIS and VIIRS on the MODIS scale`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          setHover(Math.max(0, Math.min(rows.length - 1, Math.round(((px - L) / (W - L - R)) * (rows.length - 1)))));
        }}>
        {ti0 >= 0 && ti1 >= 0 && (
          <g>
            <rect x={x(ti0) - 4} y={T} width={x(ti1) - x(ti0) + 8} height={H - T - B} fill="#4C8DFF" opacity="0.07" rx="4" />
            <text x={x(ti0)} y={T + 10} fontSize="9" fill="#9AA6C0">Test years</text>
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
        {(["MODIS", "MODIS_EQ"] as const).map((k, n) => (
          <motion.path key={`${k}-${label}`} d={path(k)} fill="none" stroke={LINE[k].color}
            strokeWidth={k === "MODIS_EQ" ? 2 : 1.6} strokeDasharray={LINE[k].dash} strokeLinejoin="round" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: n * 0.15, ease: [0.22, 1, 0.36, 1] }} />
        ))}
        {row && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#9AA6C0" strokeDasharray="2 2" />
            {(["MODIS", "MODIS_EQ"] as const).map((k) => <circle key={k} cx={x(hover)} cy={y(row[k])} r="3" fill={LINE[k].color} />)}
            <text x={Math.min(x(hover) + 4, W - 30)} y={H - B - 4} fontSize="10" fill="#E8ECF5" className="num">{row.year}</text>
          </g>
        )}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">Hotspots per year. Where the method works, the white line follows the amber one, including in the shaded test years.</figcaption>
    </figure>
  );
}
