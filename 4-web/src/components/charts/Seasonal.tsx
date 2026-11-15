import { scaleLinear } from "d3-scale";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { fmt } from "../../lib/format";
import { MONTHS, type Range, type Stats } from "../../lib/series";
import { seasonalAnswer, seasonalBand, thinBy } from "../../lib/seasonal";
import type { MonthlySeries } from "../../lib/types";
import { BOTTOM, FOCUS, H, Key, LEFT, Line, MUTED, path, RIGHT, TOP, transition, YAxis } from "./plot";

export function Seasonal({
  series,
  stats,
  focus,
  range,
  width,
  animationKey,
  onHover,
}: {
  series: MonthlySeries;
  stats: Stats;
  focus: number | null;
  range: Range;
  width: number;
  animationKey: string;
  onHover: (index: number | null) => void;
}) {
  const points = useMemo(() => seasonalBand(series, stats, focus), [series, stats, focus]);
  const [hover, setHover] = useState<number | null>(null);
  const x = scaleLinear()
    .domain([0, 11])
    .range([LEFT, width - RIGHT]);
  const y = scaleLinear()
    .domain([0, Math.max(1, ...points.flatMap((p) => [p.value ?? 0, p.band?.p90 ?? 0]))])
    .nice()
    .range([BOTTOM, TOP]);
  const band = points[0].band
    ? path(points.map((p) => ({ x: x(p.month), y: y(p.band!.p10) }))) +
      [...points]
        .reverse()
        .map((p) => `L${x(p.month)},${y(p.band!.p90)}`)
        .join("") +
      "Z"
    : "";
  const active = hover === null ? null : points[hover];
  const step = thinBy((width - LEFT - RIGHT) / 11);
  const pick = (month: number | null) => {
    setHover(month);
    const p = month === null ? null : points[month];
    onHover(p && p.index >= range.from && p.index <= range.to && p.value !== null ? p.index : null);
  };
  const detail = (p: (typeof points)[number]) =>
    `${MONTHS[p.month]} ${focus ?? ""}: ${p.value === null ? "no data" : `${fmt(p.value)} hotspots`}${p.partial ? " (partial month)" : ""}${p.provisional ? " (provisional)" : ""}`;
  return (
    <>
      <p className="chart-answer">{seasonalAnswer(points, focus)}</p>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        className="block touch-pan-y"
        role="img"
        tabIndex={0}
        aria-label={`How does ${focus ?? "the focused year"} compare through the seasons? Monthly hotspots, January to December.`}
        onPointerMove={(e) =>
          pick(
            Math.max(
              0,
              Math.min(
                11,
                Math.round(
                  x.invert(
                    ((e.clientX - e.currentTarget.getBoundingClientRect().left) * width) /
                      e.currentTarget.getBoundingClientRect().width,
                  ),
                ),
              ),
            ),
          )
        }
        onPointerDown={(e) =>
          pick(
            Math.max(
              0,
              Math.min(
                11,
                Math.round(
                  x.invert(
                    ((e.clientX - e.currentTarget.getBoundingClientRect().left) * width) /
                      e.currentTarget.getBoundingClientRect().width,
                  ),
                ),
              ),
            ),
          )
        }
        onPointerLeave={() => pick(null)}
        onPointerCancel={() => pick(null)}
        onBlur={() => pick(null)}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) {
            e.preventDefault();
            pick(
              e.key === "Escape"
                ? null
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? 11
                    : Math.max(0, Math.min(11, (hover ?? 0) + (e.key === "ArrowLeft" ? -1 : 1))),
            );
          }
        }}
      >
        <desc>
          Hover or use left and right arrow keys for values. Gaps mean no data; dashed segments and hollow dots mark
          partial months. The neutral band excludes the focused year.
        </desc>
        <YAxis width={width} ticks={y.ticks(3)} y={y} />
        <g key={animationKey}>
          {band && (
            <motion.path
              d={band}
              fill={MUTED}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.18 }}
              transition={transition}
            />
          )}
          <Line d={path(points.map((p) => ({ x: x(p.month), y: p.band ? y(p.band.median) : null })))} color={MUTED} />
          <Line
            d={path(points.map((p) => ({ x: x(p.month), y: p.value === null || p.partial ? null : y(p.value) })))}
            color={FOCUS}
          />
          {points.slice(1).map((p, i) => {
            const prev = points[i];
            return p.value !== null && prev.value !== null && (p.partial || prev.partial) ? (
              <Line key={p.month} d={`M${x(i)},${y(prev.value)}L${x(p.month)},${y(p.value)}`} color={FOCUS} dashed />
            ) : null;
          })}
        </g>
        {points.map((p) => (
          <g key={p.month}>
            {p.month % step === 0 && (
              <text x={x(p.month)} y={H - 5} textAnchor="middle" fontSize={11} fill={MUTED}>
                {MONTHS[p.month]}
              </text>
            )}
            {p.value !== null && (
              <circle
                cx={x(p.month)}
                cy={y(p.value)}
                r={hover === p.month ? 4 : 2.5}
                fill={p.partial ? "var(--color-surface)" : FOCUS}
                stroke={FOCUS}
                strokeDasharray={p.partial ? "2 2" : undefined}
              >
                <title>{detail(p)}</title>
              </circle>
            )}
          </g>
        ))}
        {active && (
          <line x1={x(active.month)} x2={x(active.month)} y1={TOP} y2={BOTTOM} stroke={MUTED} strokeOpacity={0.5} />
        )}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {active ? (
          <>
            {detail(active)}
            {active.band &&
              ` · Median ${fmt(active.band.median)} · p10–p90 ${fmt(active.band.p10)}–${fmt(active.band.p90)}`}
          </>
        ) : (
          "Hover or use arrow keys to compare a month."
        )}
      </div>
      <div className="chart-legend">
        <Key color={FOCUS}>{focus ?? "Focused year"}</Key>
        {points[0].band && (
          <>
            <Key color={MUTED}>Median</Key>
            <Key color={MUTED} band>
              p10–p90 · {points[0].n} other complete years
            </Key>
          </>
        )}
        {points.some((p) => p.partial) && <span>Dashed / hollow: partial</span>}
        {points.some(
          (p) =>
            p.provisional ||
            (p.band &&
              series.provisionalFrom !== undefined &&
              stats.baselineYears.some(
                (year) => year !== focus && (year - series.startYear) * 12 + p.month >= series.provisionalFrom!,
              )),
        ) && <span>Includes provisional data</span>}
      </div>
    </>
  );
}
