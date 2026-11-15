import { scaleLinear } from "d3-scale";
import { useMemo } from "react";
import { SENSOR } from "../../lib/color";
import { fmt } from "../../lib/format";
import { completeAnnual, thinBy } from "../../lib/seasonal";
import type { Range } from "../../lib/series";
import type { MonthlySeries } from "../../lib/types";
import { BOTTOM, H, Key, LEFT, Line, MUTED, path, RIGHT, TOP, YAxis } from "./plot";

export function Sensors({
  monthly,
  range,
  width,
  animationKey,
}: {
  monthly: { converted: MonthlySeries; observed: MonthlySeries };
  range: Range;
  width: number;
  animationKey: string;
}) {
  const rows = useMemo(() => {
    const converted = completeAnnual(monthly.converted, range),
      observed = completeAnnual(monthly.observed, range);
    return observed.flatMap((v) => {
      const m = converted.find((p) => p.year === v.year);
      return m
        ? [{ year: v.year, MODIS: m.value, MODIS_EQ: v.value, provisional: m.provisional || v.provisional }]
        : [];
    });
  }, [monthly, range.from, range.to]);
  if (!rows.length) return <p className="chart-answer">No complete year with real VIIRS in the selected dates.</p>;
  const comparable = rows.filter((p) => p.MODIS > 0);
  const difference = comparable.length
    ? comparable.reduce((sum, p) => sum + Math.abs(p.MODIS_EQ - p.MODIS) / p.MODIS, 0) / comparable.length
    : null;
  const first = rows[0].year,
    last = rows[rows.length - 1].year;
  const x = scaleLinear()
    .domain(first === last ? [first - 1, last + 1] : [first, last])
    .range([LEFT, width - RIGHT]);
  const y = scaleLinear()
    .domain([0, Math.max(1, ...rows.flatMap((p) => [p.MODIS, p.MODIS_EQ]))])
    .nice()
    .range([BOTTOM, TOP]);
  const step = thinBy((width - LEFT - RIGHT) / Math.max(1, last - first), 44);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  return (
    <>
      <p className="chart-answer">
        {difference === null
          ? "Converted MODIS totals are zero; a percentage difference cannot be calculated."
          : `Converted MODIS and real VIIRS differ by ${(difference * 100).toFixed(1)}% a year on average across ${comparable.length} complete ${comparable.length === 1 ? "year" : "years"}: how far to trust the converted years before 2012.`}
      </p>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        className="block"
        role="img"
        aria-label="Does converted MODIS match real VIIRS? Annual hotspots in complete years with both, within selected dates."
      >
        <desc>
          Amber is MODIS converted to the NOAA-20 scale; cyan is real VIIRS. Incomplete years are omitted and gaps stay
          disconnected. The answer uses the mean absolute percentage difference, excluding zero totals.
        </desc>
        <YAxis width={width} ticks={y.ticks(3)} y={y} />
        <g key={animationKey}>
          {(["MODIS", "MODIS_EQ"] as const).map((kind) => (
            <Line
              key={kind}
              color={SENSOR[kind === "MODIS" ? "MODIS" : "VIIRS"].color}
              d={path(
                years.map((year) => {
                  const p = rows.find((row) => row.year === year);
                  return { x: x(year), y: p ? y(p[kind]) : null };
                }),
              )}
            />
          ))}
        </g>
        {rows.map((p) => (
          <g key={p.year}>
            {(["MODIS", "MODIS_EQ"] as const).map((kind) => (
              <circle
                key={kind}
                cx={x(p.year)}
                cy={y(p[kind])}
                r={2.8}
                fill={SENSOR[kind === "MODIS" ? "MODIS" : "VIIRS"].color}
              >
                <title>{`${p.year}, ${kind === "MODIS" ? "MODIS converted" : "VIIRS, real"}: ${fmt(p[kind])} hotspots${p.provisional ? " (provisional)" : ""}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {years
          .filter((_, i) => i % step === 0)
          .map((year) => (
            <text key={year} x={x(year)} y={H - 5} textAnchor="middle" fill={MUTED} fontSize={11}>
              {year}
            </text>
          ))}
      </svg>
      <div className="chart-legend">
        <Key color={SENSOR.MODIS.color}>MODIS, converted</Key>
        <Key color={SENSOR.VIIRS.color}>VIIRS, real</Key>
        <span>Annual hotspots on the NOAA-20 scale · Complete years only</span>
        {comparable.length < rows.length && <span>Zero totals excluded from %</span>}
        {rows.some((p) => p.provisional) && <span>Includes provisional data</span>}
      </div>
    </>
  );
}
