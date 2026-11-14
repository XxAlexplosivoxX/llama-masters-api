import { useState } from "react";
import { fmtTick, TICK, thinBy } from "../lib/chart";
import { GRID, MODIS, SENSOR, VIIRS, sensorOf } from "../lib/color";
import { fmt } from "../lib/format";
import { useWidth } from "../hooks/useWidth";
import { PLATFORMS, type CsvPoint } from "../types";

interface Props {
  points: CsvPoint[];
}

type Metric = "count" | "frp" | "day";
const METRICS: { id: Metric; label: string }[] = [
  { id: "count", label: "Hotspots" },
  { id: "frp", label: "Mean FRP (MW)" },
  { id: "day", label: "Day share (%)" },
];

const H = 130, L = 36, B = 20, T = 8;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Last 7 days of point data: MODIS and VIIRS side by side per day, never stacked. */
export function Last7Days({ points }: Props) {
  const [metric, setMetric] = useState<Metric>("count");
  const { ref, width } = useWidth();
  if (!points.length) {
    return <p className="rounded-lg border border-dashed border-grid p-4 text-sm text-muted">No near-real-time points in this selection.</p>;
  }

  const days = [...new Set(points.map((p) => p.date))].sort().slice(-7);
  const value = (day: string, sensor: "MODIS" | "VIIRS") => {
    const pts = points.filter((p) => p.date === day && sensorOf(p.platform) === sensor);
    if (!pts.length) return null;
    if (metric === "count") return pts.length;
    if (metric === "frp") {
      const v = pts.filter((p) => p.frp !== null);
      return v.length ? v.reduce((a, p) => a + p.frp!, 0) / v.length : null;
    }
    const v = pts.filter((p) => p.daynight !== null);
    return v.length ? (v.filter((p) => p.daynight === "D").length / v.length) * 100 : null;
  };

  const max = Math.max(1, ...days.flatMap((d) => [value(d, "MODIS") ?? 0, value(d, "VIIRS") ?? 0]));
  const slot = Math.max((width - L) / days.length, 1);
  const barW = (slot - 8) / 2;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const label = (d: string) => slot >= 56 ? `${DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(8)}` : d.slice(8);
  const step = thinBy(slot, 44);

  const bySat = PLATFORMS.map((p) => ({ p, n: points.filter((x) => x.platform === p).length }))
    .filter((e) => e.n > 0);
  const satMax = Math.max(1, ...bySat.map((e) => e.n));

  return (
    <div ref={ref}>
      <div className="seg seg-40 mb-3" role="group" aria-label="Metric">
        {METRICS.map((m) => (
          <button key={m.id} aria-pressed={metric === m.id} onClick={() => setMetric(m.id)} className="!min-h-0 !px-3">
            {metric === m.id && <span className="absolute inset-0 rounded-[9px] bg-grid ring-1 ring-grid" />}
            <span className="relative">{m.label}</span>
          </button>
        ))}
      </div>

      {width > 0 && (
        <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} className="block" role="img" aria-label="Last 7 days, MODIS and VIIRS side by side">
          {[0, 1].map((t) => (
            <g key={t}>
              <line x1={L} x2={width} y1={y(max * t)} y2={y(max * t)} stroke={GRID} />
              <text x={L - 5} y={y(max * t) + 3.5} fontSize={TICK.size} fill={TICK.fill} textAnchor="end" className="num">
                {metric === "day" ? `${Math.round(max * t)}%` : fmtTick(Math.round(max * t))}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x0 = L + i * slot + 4;
            return (
              <g key={d}>
                {(["MODIS", "VIIRS"] as const).map((s, k) => {
                  const v = value(d, s);
                  return v === null ? null : (
                    <rect key={s} x={x0 + k * barW} y={y(v)} width={Math.max(barW - 1, 1)} height={Math.max(1, H - B - y(v))}
                      rx={2} fill={s === "MODIS" ? MODIS : VIIRS}>
                      <title>{`${d} ${s}: ${metric === "day" ? `${v.toFixed(0)}%` : metric === "frp" ? `${v.toFixed(1)} MW` : fmt(v)}`}</title>
                    </rect>
                  );
                })}
                {i % step === 0 && (
                  <text x={x0 + barW - 0.5} y={H - 6} textAnchor="middle" fontSize={TICK.size} fill={TICK.fill}>{label(d)}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="mt-1 flex gap-4 text-2xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: MODIS }} /> MODIS</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: VIIRS }} /> VIIRS</span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {bySat.map(({ p, n }) => (
          <li key={p} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
            <span className="text-muted">{p}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-grid">
              <span className="block h-full rounded-full" style={{ background: SENSOR[p], width: `${(n / satMax) * 100}%` }} />
            </span>
            <span className="num text-right text-text">{fmt(n)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-2xs text-muted">Provisional near-real-time data, not added to the monthly history.</p>
    </div>
  );
}
