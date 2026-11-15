import { useState } from "react";
import { AXIS, fmtTick, NOTE, TICK } from "../lib/chart";
import { AlertTriangle } from "lucide-react";
import { GRID, MODIS, MODIS_EQ, MUTED, TEXT, VIIRS } from "../lib/color";
import { fmt, fmtPercent } from "../lib/format";
import { MONTHS } from "../lib/shared";
import { useWidth } from "../hooks/useWidth";
import type { MonthlyGrid } from "../types";
import type { PlaceData } from "../hooks/usePlaceData";

const H = 160, L = 40, R = 8, T = 12, B = 20;
const LINE = {
  MODIS: { color: MODIS, label: "MODIS" },
  MODIS_EQ: { color: TEXT, label: "VIIRS on the MODIS scale" },
  VIIRS: { color: VIIRS, label: "VIIRS raw (375 m, not comparable)" },
};
type LineKey = keyof typeof LINE;
type QualityCounts = { read: number; low_confidence: number; static_type: number; outside: number; kept: number };

type Row = { year: number; MODIS: number; VIIRS: number; MODIS_EQ: number };

/** How the harmonized record is built, plus the evidence for this place. */
export function Harmonization({ data, grid }: { data: PlaceData; grid: MonthlyGrid }) {
  const rows = data.harmonization?.annual ?? [];
  const check = data.harmonization?.check;
  const [hover, setHover] = useState<number | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const { ref, width } = useWidth();
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

      {rows.length > 1 && (
        <div>
          <label className="mb-1.5 inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} className="accent-[#F97316]" />
            Show raw VIIRS (before conversion)
          </label>
          {width > 0 && <Chart rows={rows} testYears={h.test_years} hover={hover} setHover={setHover} width={width} showRaw={showRaw} />}
        </div>
      )}

      <p className="text-muted">
        <span className="font-semibold text-text">Checked on years it never saw.</span>{" "}
        For {h.test_years.join("–")}, converted VIIRS was off from real MODIS by{" "}
        <span className="num text-text">{Math.round((check?.wape ?? h.test.model.wape) * 100)}%</span> month to month
        {check ? " in this area" : ` across ${grid.label}`}, against <span className="num">{Math.round(h.test.raw_viirs.wape * 100)}%</span> for raw VIIRS.
        {h.test.single_ratio.wape < h.test.model.wape && (
          <> One fixed ratio for every month scores <span className="num">{(h.test.single_ratio.wape * 100).toFixed(1)}%</span> across {grid.label},
            {" "}slightly better than this method's <span className="num">{(h.test.model.wape * 100).toFixed(1)}%</span>, so the seasonal adjustment is not yet proven for the whole area.</>
        )}
      </p>

      <Caveats grid={grid} />

      <details className="group rounded-lg border border-grid p-3">
        <summary className="cursor-pointer text-sm font-semibold text-text">Method details</summary>
      <div className="mt-3 space-y-4">
      <p className="text-muted">
        <span className="font-semibold text-text">Test detail.</span>{" "}
        For {h.test_years.join("–")}, converted VIIRS was off from real MODIS by{" "}
        {check
          ? <><span className="num text-text">{Math.round(check.wape * 100)}%</span> month to month in this area (<span className="num">{fmtPercent(check.bias)}</span> overall)</>
          : <><span className="num text-text">{Math.round(h.test.model.wape * 100)}%</span> month to month across {grid.label}</>}
        ; raw VIIRS would be off by <span className="num">{Math.round(h.test.raw_viirs.wape * 100)}%</span>.
        {" "}Across {grid.label}, one fixed ratio for every month scores <span className="num">{Math.round(h.test.single_ratio.wape * 100)}%</span>
        {h.test.single_ratio.wape < h.test.model.wape
          ? ", slightly better than this method here, so the seasonal adjustment is not yet proven for the whole area."
          : `, against ${Math.round(h.test.model.wape * 100)}% for this method.`}
      </p>

      <div ref={ref}>
        <p className="mb-1.5 text-xs text-muted">Monthly coefficients k<sub>m</sub> · ((1 + VIIRS)<sup>β<sub>m</sub></sup> − 1)</p>
        {width > 0 && <CoefficientStrip grid={grid} width={width} />}
      </div>
      <p className="text-xs text-muted">{h.method}</p>
      </div>
      </details>
    </div>
  );
}

/** Warnings shipped in the grid JSON: harmonization caveats, data limitations, baseline notes and quality filtering. */
function Caveats({ grid }: { grid: MonthlyGrid }) {
  const sensors = Object.entries(grid.sensors) as [string, (typeof grid.sensors)[keyof typeof grid.sensors] & { quality_counts?: QualityCounts }][];
  return (
    <div className="space-y-3 rounded-lg border border-alert/40 bg-alert/5 p-3 text-xs leading-snug text-muted">
      <div>
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-alert">
          <AlertTriangle size={13} aria-hidden /> Caveats of the harmonization
        </p>
        <ul className="list-disc space-y-0.5 pl-4">{grid.harmonization.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
      <div>
        <p className="mb-1 font-semibold text-text">Baselines</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {sensors.map(([id, s]) => <li key={id}><span className="text-text">{id}:</span> {s.baseline_note}</li>)}
        </ul>
      </div>
      <div>
        <p className="mb-1 font-semibold text-text">Limitations</p>
        <ul className="list-disc space-y-0.5 pl-4">{grid.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
      {sensors.some(([, s]) => s.quality_counts) && (
        <div>
          <p className="mb-1 font-semibold text-text">Quality filtering (whole place)</p>
          <ul className="space-y-0.5">
            {sensors.map(([id, s]) => s.quality_counts && (
              <li key={id} className="num">
                <span className="text-text">{id}:</span> kept {fmt(s.quality_counts.kept)} of {fmt(s.quality_counts.read)} detections
                {" "}({Math.round((s.quality_counts.kept / Math.max(1, s.quality_counts.read)) * 100)}%); dropped {fmt(s.quality_counts.low_confidence)} low confidence,
                {" "}{fmt(s.quality_counts.static_type)} static sources, {fmt(s.quality_counts.outside)} outside the place.
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const STRIP_H = 72;

function CoefficientStrip({ grid, width }: { grid: MonthlyGrid; width: number }) {
  const coef = grid.harmonization.coefficients;
  const slot = width / 12;
  const labels = slot >= 28 ? MONTHS : MONTHS.map((m) => m[0]);
  const maxK = Math.max(...coef.map((c) => c.k));
  const barH = 26;
  const top = 14; // k labels above the bars
  const baseline = top + barH;
  return (
    <svg viewBox={`0 0 ${width} ${STRIP_H}`} width="100%" height={STRIP_H} className="block" role="img"
      aria-label="Harmonization coefficients per calendar month">
      {coef.map((c, i) => {
        const h = Math.max(2, (c.k / maxK) * barH);
        return (
          <g key={c.month}>
            {slot >= 30 && (
              <text x={i * slot + slot / 2} y={top - 3} fontSize={TICK.size} fill={TICK.fill} textAnchor="middle" className="num">
                {c.k.toFixed(2)}
              </text>
            )}
            <rect x={i * slot + 2} y={baseline - h} width={Math.max(slot - 4, 1)} height={h} rx={2} fill={MODIS_EQ}>
              <title>{`${MONTHS[i]}: k=${c.k.toFixed(3)}, β=${c.beta.toFixed(3)} (${fmt(c.pairs)} pairs)`}</title>
            </rect>
            <text x={i * slot + slot / 2} y={baseline + 13} fontSize={TICK.size} fill={TICK.fill} textAnchor="middle">
              {labels[i]}
            </text>
          </g>
        );
      })}
      <line x1={0} x2={width} y1={baseline + 0.5} y2={baseline + 0.5} stroke={GRID} />
    </svg>
  );
}

function Chart({ rows, testYears, hover, setHover, width, showRaw }: {
  rows: Row[]; testYears: [number, number]; hover: number | null; setHover: (i: number | null) => void; width: number; showRaw: boolean;
}) {
  // Raw VIIRS is opt-in: at ~4× it flattens the two lines that should match.
  const keys: LineKey[] = showRaw ? ["MODIS", "MODIS_EQ", "VIIRS"] : ["MODIS", "MODIS_EQ"];
  const max = Math.max(1, ...rows.flatMap((r) => keys.map((k) => r[k])));
  const x = (i: number) => L + (i / (rows.length - 1)) * (width - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (k: LineKey) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join("");
  const ti0 = rows.findIndex((r) => r.year === testYears[0]), ti1 = rows.findIndex((r) => r.year === testYears[1]);
  const row = hover !== null ? rows[hover] : null;
  const yearStep = Math.max(1, Math.ceil(rows.length / Math.floor((width - L - R) / 44)));

  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden><path d="M1 4H17" stroke={LINE[k].color} strokeWidth="2" strokeDasharray={k === "VIIRS" ? "4 2" : undefined} /></svg>
            {LINE[k].label}
            {row && <span className="num text-text">{fmt(Math.round(row[k]))}</span>}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${H}`} width="100%" height={H} className="block" role="img"
        aria-label={`Hotspots per year, ${rows[0].year} to ${rows.at(-1)!.year}: MODIS and VIIRS on the MODIS scale${showRaw ? ", plus raw VIIRS" : ""}`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - box.left;
          setHover(Math.max(0, Math.min(rows.length - 1, Math.round(((px - L) / (width - L - R)) * (rows.length - 1)))));
        }}>
        {ti0 >= 0 && ti1 >= 0 && (
          <g>
            <rect x={x(ti0) - 4} y={T} width={x(ti1) - x(ti0) + 8} height={H - T - B} fill={MODIS} opacity="0.07" rx={4} />
            <text x={x(ti0)} y={T + 10} fontSize={NOTE.size} fill={MUTED}>Test years</text>
          </g>
        )}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={width - R} y1={y(max * f)} y2={y(max * f)} stroke={GRID} />
            <text x={L - 6} y={y(max * f) + 3.5} fontSize={TICK.size} fill={TICK.fill} textAnchor="end" className="num">
              {fmtTick(Math.round(max * f))}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (i % yearStep === 0 || i === rows.length - 1) && (
          <text key={r.year} x={x(i)} y={H - 6} fontSize={TICK.size} fill={TICK.fill}
            textAnchor={i === rows.length - 1 ? "end" : "middle"} className="num">{r.year}</text>
        ))}
        {keys.map((k) => (
          <path key={k} d={path(k)} fill="none" stroke={LINE[k].color} strokeDasharray={k === "VIIRS" ? "5 3" : undefined}
            strokeWidth={k === "MODIS_EQ" ? 2 : 1.6} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {row && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke={MUTED} strokeDasharray="2 2" />
            {keys.map((k) => <circle key={k} cx={x(hover)} cy={y(row[k])} r="3" fill={LINE[k].color} />)}
            <text x={Math.min(x(hover) + 5, width - 32)} y={H - B - 4} fontSize={AXIS.size} fill={TEXT} className="num">{row.year}</text>
          </g>
        )}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">Hotspots per year. Where the method works, the white line follows the blue one, including in the shaded test years.{showRaw ? " The dashed raw VIIRS line is shown only to illustrate the conversion; it is not comparable with MODIS." : ""}</figcaption>
    </figure>
  );
}
