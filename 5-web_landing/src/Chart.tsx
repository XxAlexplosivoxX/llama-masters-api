import { useMemo, useState } from "react";
import type { Record_ } from "./data";

const W = 720,
  H = 300,
  PAD = { top: 16, right: 16, bottom: 28, left: 52 };

const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Yearly hotspots: raw MODIS against the harmonized record, with the VIIRS start marked. */
export function Chart({ data }: { data: Record_ }) {
  const { years, viirsStart } = data;
  const [hover, setHover] = useState<number | null>(null);

  const g = useMemo(() => {
    const max = Math.max(1, ...years.map((y) => Math.max(y.harmonized, y.p90 ?? 0, y.modis))) * 1.08;
    const x0 = years[0]?.year ?? 2001,
      x1 = years.at(-1)?.year ?? 2025;
    const x = (year: number) => PAD.left + ((year - x0) / Math.max(1, x1 - x0)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - (v / max) * (H - PAD.top - PAD.bottom);
    const line = (pick: (r: (typeof years)[number]) => number) =>
      years.map((r, i) => `${i ? "L" : "M"}${x(r.year).toFixed(1)},${y(pick(r)).toFixed(1)}`).join("");
    const banded = years.filter((r) => r.p10 !== null);
    const band = banded.length
      ? banded.map((r, i) => `${i ? "L" : "M"}${x(r.year)},${y(r.p90!)}`).join("") +
        [...banded]
          .reverse()
          .map((r) => `L${x(r.year)},${y(r.p10!)}`)
          .join("") +
        "Z"
      : "";
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => (max / 1.08) * f);
    const yearTicks = years.filter((r) => r.year % 5 === 0).map((r) => r.year);
    return { x, y, modis: line((r) => r.modis), harmonized: line((r) => r.harmonized), band, ticks, yearTicks };
  }, [years]);

  const shown = hover === null ? null : years[hover];

  return (
    <figure className="m-0">
      <div className="mb-3 flex min-h-12 flex-wrap items-end justify-between gap-x-6 gap-y-2 text-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Key colour="bg-heat-4" label="Harmonized record (VIIRS scale)" value={shown?.harmonized} />
          <Key colour="bg-modis" label="MODIS as detected" value={shown?.modis} />
        </div>
        <span className="tabular-nums text-muted">{shown ? shown.year : "Hover a year"}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none select-none"
        role="img"
        aria-label="Yearly hotspots: the harmonized record and raw MODIS detections"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          let best = 0;
          years.forEach((r, i) => {
            if (Math.abs(g.x(r.year) - px) < Math.abs(g.x(years[best].year) - px)) best = i;
          });
          setHover(best);
        }}
      >
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={g.y(t)} y2={g.y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={g.y(t) + 4} textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {fmt.format(t)}
            </text>
          </g>
        ))}
        {g.yearTicks.map((yr) => (
          <text key={yr} x={g.x(yr)} y={H - 8} textAnchor="middle" className="fill-muted text-[11px] tabular-nums">
            {yr}
          </text>
        ))}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={Math.max(0, g.x(viirsStart) - PAD.left)}
          height={H - PAD.top - PAD.bottom}
          className="fill-surface-2"
          opacity={0.55}
        />
        <line
          x1={g.x(viirsStart)}
          x2={g.x(viirsStart)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          className="stroke-viirs"
          strokeDasharray="3 4"
        />
        <text x={g.x(viirsStart) + 6} y={PAD.top + 12} className="fill-viirs text-[11px] font-semibold">
          VIIRS from {viirsStart}
        </text>
        <text x={PAD.left + 8} y={PAD.top + 12} className="fill-muted text-[11px]">
          Reconstructed from MODIS
        </text>
        {g.band && <path d={g.band} className="fill-heat-4" opacity={0.22} />}
        <path d={g.modis} fill="none" className="stroke-modis" strokeWidth={2} strokeLinejoin="round" />
        <path d={g.harmonized} fill="none" className="stroke-heat-4" strokeWidth={2.5} strokeLinejoin="round" />
        {shown && (
          <g>
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
      <figcaption className="mt-2 text-xs text-muted">
        Complete calendar years. The shaded band is the 10–90% range of the reconstruction, from leave-one-year-out
        testing.
      </figcaption>
    </figure>
  );
}

function Key({ colour, label, value }: { colour: string; label: string; value?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${colour}`} />
      <span className="text-muted">{label}</span>
      {value !== undefined && <span className="font-semibold tabular-nums">{fmt.format(value)}</span>}
    </span>
  );
}
