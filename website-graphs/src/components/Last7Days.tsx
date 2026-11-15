import { useState } from "react";
import { fmtTick, TICK, thinBy } from "../lib/chart";
import { ALERT, GRID, MODIS, SENSOR, VIIRS, sensorOf } from "../lib/color";
import { fmt } from "../lib/format";
import { useWidth } from "../hooks/useWidth";
import { PLATFORMS, type CsvPoint } from "../types";

interface Props {
  points: CsvPoint[];
  recentStatus?: "loading" | "ready" | "unavailable";
  recentTruncated?: boolean;
  canSelectArea?: boolean;
}

type Metric = "count" | "frp" | "day";
type Sensor = "MODIS" | "VIIRS";
const METRICS: { id: Metric; label: string }[] = [
  { id: "count", label: "Hotspots" },
  { id: "frp", label: "Mean FRP (MW)" },
  { id: "day", label: "Day share (%)" },
];
const PANELS: { sensor: Sensor; resolution: string; color: string }[] = [
  { sensor: "MODIS", resolution: "1 km", color: MODIS },
  { sensor: "VIIRS", resolution: "375 m", color: VIIRS },
];

const H = 96, L = 40, B = 20, T = 8;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Last 7 days of point data: MODIS and VIIRS in separate panels, each on its own scale. */
export function Last7Days({ points, recentStatus = "ready", recentTruncated = false, canSelectArea = false }: Props) {
  const [metric, setMetric] = useState<Metric>("count");
  const { ref, width } = useWidth();
  if (recentStatus === "loading") return <div className="animate-pulse rounded-lg border border-dashed border-grid p-4 text-sm text-muted" role="status">Loading the last 7 days…</div>;
  if (recentStatus === "unavailable") return <p className="rounded-lg border border-dashed border-grid p-4 text-sm text-muted">Recent points are not available for this region</p>;
  if (!points.length) {
    return <p className="rounded-lg border border-dashed border-grid p-4 text-sm text-muted">No near-real-time points in this selection.</p>;
  }

  const observedDays = [...new Set(points.map((p) => p.date))].sort();
  const days = recentTruncated && observedDays.length
    ? Array.from({ length: 7 }, (_, i) => new Date(new Date(`${observedDays.at(-1)}T00:00:00Z`).getTime() - (6 - i) * 86400000).toISOString().slice(0, 10))
    : observedDays.slice(-7);
  const oldestPresentDay = observedDays[0];
  const value = (day: string, sensor: Sensor) => {
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
  const show = (v: number) => (metric === "day" ? `${v.toFixed(0)}%` : metric === "frp" ? `${v.toFixed(1)} MW` : fmt(v));

  const slot = Math.max((width - L) / days.length, 1);
  const barW = Math.max(slot - 8, 1);
  const label = (d: string) => slot >= 56 ? `${DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(8)}` : d.slice(8);
  const step = thinBy(slot, 44);

  const bySat = PLATFORMS.map((p) => ({ p, n: points.filter((x) => x.platform === p).length })).filter((e) => e.n > 0);
  const satMax = Math.max(1, ...bySat.map((e) => e.n));

  return (
    <div ref={ref}>
      <div className="seg seg-40 mb-3" role="group" aria-label="Metric">
        {METRICS.map((m) => (
          <button key={m.id} aria-pressed={metric === m.id} onClick={() => setMetric(m.id)} className="!px-3">
            {metric === m.id && <span className="absolute inset-0 rounded-[9px] bg-grid ring-1 ring-grid" />}
            <span className="relative">{m.label}</span>
          </button>
        ))}
      </div>

      {width > 0 && PANELS.map(({ sensor, resolution, color }) => {
        const vals = days.map((d) => value(d, sensor));
        const max = Math.max(1, ...vals.map((v) => v ?? 0));
        const y = (v: number) => T + (1 - v / max) * (H - T - B);
        return (
          <figure key={sensor} className="mb-3">
            <figcaption className="mb-1 flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
              <span className="font-semibold text-text">{sensor}</span> {resolution} pixels
            </figcaption>
            <svg viewBox={`0 0 ${width} ${H}`} width="100%" height={H} className="block" role="img"
              aria-label={`${sensor} last 7 days, own scale: ${days.map((d, i) => `${d} ${recentTruncated && d < oldestPresentDay ? "no data (capped)" : vals[i] === null ? "no data" : show(vals[i]!)}${(i === days.length - 1 || (recentTruncated && d === oldestPresentDay)) ? " (incomplete day)" : ""}`).join("; ")}`}>
              <defs>
                <pattern id="l7-partial" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="4" stroke={ALERT} strokeWidth="1.2" />
                </pattern>
              </defs>
              {[0, 1].map((t) => (
                <g key={t}>
                  <line x1={L} x2={width} y1={y(max * t)} y2={y(max * t)} stroke={GRID} />
                  <text x={L - 5} y={y(max * t) + 4} fontSize={TICK.size} fill={TICK.fill} textAnchor="end" className="num">
                    {metric === "day" ? `${Math.round(max * t)}%` : fmtTick(Math.round(max * t))}
                  </text>
                </g>
              ))}
              {days.map((d, i) => {
                const v = vals[i];
                const x0 = L + i * slot + 4;
                const last = i === days.length - 1; // the latest day is usually still being filled in
                const cappedAbsent = recentTruncated && d < oldestPresentDay;
                const incomplete = last || (recentTruncated && d === oldestPresentDay);
                return (
                  <g key={d}>
                    {cappedAbsent && <title>{`${d}: no data (capped)`}</title>}
                    {v !== null && (
                      <rect x={x0} y={y(v)} width={barW} height={Math.max(1, H - B - y(v))} rx={2} fill={color} aria-label={`${d} ${sensor}: ${show(v)}${incomplete ? " (incomplete day)" : ""}`}>
                        <title>{`${d} ${sensor}: ${show(v)}${incomplete ? " (incomplete day)" : ""}`}</title>
                      </rect>
                    )}
                    {v !== null && incomplete && (
                      <rect x={x0} y={y(v)} width={barW} height={Math.max(1, H - B - y(v))} rx={2} fill="url(#l7-partial)" pointerEvents="none" />
                    )}
                    {i % step === 0 && (
                      <text x={x0 + barW / 2} y={H - 5} textAnchor="middle" fontSize={TICK.size} fill={TICK.fill}>{label(d)}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </figure>
        );
      })}
      {(recentTruncated || days.length > 0) && <p className="mb-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs leading-snug text-muted" role="status">
        {recentTruncated ? `The server capped the points; the oldest day in this window is incomplete.${canSelectArea ? " Pick an area to see every point." : ""} ` : ""}
        {days.length > 0 ? "Last day is incomplete and will still change." : ""}
      </p>}
      <p className="text-xs leading-snug text-muted">Counts are not comparable between instruments, so each panel has its own scale.</p>

      {!recentTruncated && <><p className="mt-3 text-2xs text-muted">Detections per satellite (raw; MODIS and VIIRS are not comparable):</p>
      <ul className="mt-1.5 space-y-1.5">
        {bySat.map(({ p, n }) => (
          <li key={p} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
            <span className="text-muted">{p}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-grid">
              <span className="block h-full rounded-full" style={{ background: SENSOR[p], width: `${(n / satMax) * 100}%` }} />
            </span>
            <span className="num text-right text-text">{fmt(n)}</span>
          </li>
        ))}
      </ul></>}
      <p className="mt-2 text-2xs text-muted">Provisional near-real-time data, not added to the monthly history.</p>
    </div>
  );
}
