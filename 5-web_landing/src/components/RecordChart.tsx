import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";
import type { YearRow } from "../data";
import { short } from "../lib/heat";

const W = 720;
const H = 320;
const PAD = { top: 18, right: 16, bottom: 30, left: 52 };

const group: Variants = { hidden: {}, show: {} };
const draw = (duration: number, delay: number): Variants => ({
  hidden: { pathLength: 0 },
  show: { pathLength: 1, transition: { duration, delay, ease: "easeInOut" } },
});
const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 0.2, transition: { duration: 0.7, delay: 2.5 } },
};

/** Yearly hotspots: raw MODIS against the single record on the VIIRS scale. */
export function RecordChart({
  rows,
  viirsStart,
  label,
}: {
  rows: YearRow[];
  viirsStart: number | null;
  label: string;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);

  const g = useMemo(() => {
    if (rows.length === 0) return null;
    const max = Math.max(1, ...rows.map((r) => Math.max(r.harmonized, r.p90 ?? 0, r.modis)));
    const top = max * 1.08;
    const x0 = rows[0].year;
    const x1 = rows[rows.length - 1].year;
    const x = (year: number) =>
      rows.length === 1
        ? (PAD.left + W - PAD.right) / 2
        : PAD.left + ((year - x0) / Math.max(1, x1 - x0)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - (v / top) * (H - PAD.top - PAD.bottom);
    const line = (pick: (r: YearRow) => number) =>
      rows.map((r, i) => `${i ? "L" : "M"}${x(r.year).toFixed(1)},${y(pick(r)).toFixed(1)}`).join("");
    const banded = rows.filter((r) => r.p10 !== null && r.p90 !== null);
    const band = banded.length
      ? banded.map((r, i) => `${i ? "L" : "M"}${x(r.year).toFixed(1)},${y(r.p90 ?? 0).toFixed(1)}`).join("") +
        [...banded]
          .reverse()
          .map((r) => `L${x(r.year).toFixed(1)},${y(r.p10 ?? 0).toFixed(1)}`)
          .join("") +
        "Z"
      : "";
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
    const yearTicks = rows.filter((r) => r.year % 5 === 0).map((r) => r.year);
    return { x, y, modis: line((r) => r.modis), harmonized: line((r) => r.harmonized), band, ticks, yearTicks, x0, x1 };
  }, [rows]);

  if (!g) {
    return <p className="m-0 py-10 text-center text-sm text-muted">No complete years yet.</p>;
  }

  const last = rows[rows.length - 1];
  const shown = hover === null ? null : rows[hover];
  const marker = viirsStart !== null && viirsStart >= g.x0 && viirsStart <= g.x1 ? viirsStart : null;
  const range = g.x0 === g.x1 ? `${g.x0}` : `${g.x0} to ${g.x1}`;
  const animate = !reduce;

  const lines = (
    <>
      {g.band && <motion.path d={g.band} className="fill-heat-4" opacity={0.2} variants={animate ? fade : undefined} />}
      <motion.path
        d={g.modis}
        fill="none"
        className="stroke-modis"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        variants={animate ? draw(1.1, 0) : undefined}
      />
      <motion.path
        d={g.harmonized}
        fill="none"
        className="stroke-heat-4"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        variants={animate ? draw(1.4, 1.2) : undefined}
      />
      {rows.length === 1 && (
        <>
          <circle cx={g.x(last.year)} cy={g.y(last.harmonized)} r={3.5} className="fill-heat-4" />
          <circle cx={g.x(last.year)} cy={g.y(last.modis)} r={3.5} className="fill-modis" />
        </>
      )}
    </>
  );

  return (
    <figure className="m-0">
      <div className="mb-3 flex min-h-12 flex-wrap items-end justify-between gap-x-6 gap-y-2 text-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Key colour="bg-modis" text="MODIS as detected" value={shown?.modis} />
          <Key colour="bg-heat-4" text="One record, VIIRS scale" value={shown?.harmonized} />
          {g.band && (
            <span className="inline-flex items-center gap-2 text-muted">
              <span className="h-3 w-5 shrink-0 rounded-sm bg-heat-4/20" aria-hidden />
              Pale band: p10 to p90 uncertainty for years rebuilt from MODIS.
            </span>
          )}
        </div>
        <span className="tabular-nums text-muted">{shown ? shown.year : ""}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={`Yearly hotspots in ${label}, ${range}: MODIS as detected and one record on the VIIRS scale`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          if (box.width === 0) return;
          const px = ((e.clientX - box.left) / box.width) * W;
          let best = 0;
          rows.forEach((r, i) => {
            if (Math.abs(g.x(r.year) - px) < Math.abs(g.x(rows[best].year) - px)) best = i;
          });
          setHover(best);
        }}
      >
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={g.y(t)} y2={g.y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={g.y(t) + 4} textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {short(t)}
            </text>
          </g>
        ))}
        {g.yearTicks.map((yr) => (
          <text key={yr} x={g.x(yr)} y={H - 9} textAnchor="middle" className="fill-muted text-[11px] tabular-nums">
            {yr}
          </text>
        ))}
        {marker !== null && (
          <g>
            <line
              x1={g.x(marker)}
              x2={g.x(marker)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              className="stroke-viirs"
              strokeDasharray="3 4"
            />
            <text x={g.x(marker) + 6} y={PAD.top + 10} className="fill-viirs text-[11px] font-semibold">
              VIIRS from {marker}
            </text>
          </g>
        )}
        {animate ? (
          <motion.g
            key={label}
            variants={group}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            {lines}
          </motion.g>
        ) : (
          <g key={label}>{lines}</g>
        )}
        {shown && (
          <g pointerEvents="none">
            <line
              x1={g.x(shown.year)}
              x2={g.x(shown.year)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              className="stroke-muted"
              opacity={0.5}
            />
            <circle cx={g.x(shown.year)} cy={g.y(shown.harmonized)} r={4} className="fill-heat-4" />
            <circle cx={g.x(shown.year)} cy={g.y(shown.modis)} r={4} className="fill-modis" />
          </g>
        )}
      </svg>
      <p className="sr-only">
        {`${label}: complete years from ${g.x0} to ${g.x1}. In ${last.year}, MODIS as detected shows ${short(last.modis)} hotspots and the single record on the VIIRS scale shows ${short(last.harmonized)}.`}
      </p>
    </figure>
  );
}

function Key({ colour, text, value }: { colour: string; text: string; value?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-0.5 w-5 shrink-0 ${colour}`} aria-hidden />
      <span className="text-muted">{text}</span>
      {value !== undefined && <span className="font-semibold tabular-nums">{short(value)}</span>}
    </span>
  );
}
