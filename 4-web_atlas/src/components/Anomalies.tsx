import { motion } from "motion/react";
import { useState } from "react";
import { anomalyScale } from "../lib/color";
import { fmt, fmtPercent } from "../lib/format";
import { MIN_BASELINE_YEARS, MONTHS, MONTHS_LONG, type Stats } from "../lib/series";
import type { MonthlySeries } from "../lib/types";

interface Props {
  series: MonthlySeries;
  stats: Stats;
  focusYear: number | null;
  hoverMonth: number | null;
  waveKey: string;
  onFocusYear: (year: number) => void;
  onHover: (month: number | null) => void;
}

type Mode = "years" | "months";

const W = 400;
const H = 150;
const PAD_L = 42;
const MID = H / 2;
const LIMIT = 1; // ±100 % fills the half height

interface Bar {
  key: string;
  label: string;
  rel: number | null;
  detail: string;
  active: boolean;
  outsideBaseline?: boolean;
  onSelect?: () => void;
  onHover?: (on: boolean) => void;
}

export function Anomalies({ series, stats, focusYear, hoverMonth, waveKey, onFocusYear, onHover }: Props) {
  const [mode, setMode] = useState<Mode>("years");
  const color = anomalyScale(0.8);

  if (stats.baselineYears.length < MIN_BASELINE_YEARS) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
        Anomalies compare each period with the average of complete years. This selection has{" "}
        {stats.baselineYears.length} complete {stats.baselineYears.length === 1 ? "year" : "years"}; it needs{" "}
        {MIN_BASELINE_YEARS}. Pick a place with a longer history, such as Brazil.
      </p>
    );
  }

  const focusBase = focusYear !== null ? (focusYear - series.startYear) * 12 : null;
  const bars: Bar[] =
    mode === "years"
      ? stats.years.map((year) => {
          const total = stats.yearTotals.get(year) ?? null;
          const rel = total !== null && stats.meanYear ? total / stats.meanYear - 1 : null;
          const outsideBaseline = rel !== null && !stats.baselineYears.includes(year);
          return {
            key: String(year),
            label: String(year),
            rel,
            detail:
              rel === null
                ? `${year}: incomplete, not compared`
                : `${year}: ${fmt(total!)} hotspots, ${fmtPercent(rel)}${outsideBaseline ? " (not in the average)" : ""}`,
            active: year === focusYear,
            outsideBaseline,
            onSelect: () => onFocusYear(year),
          };
        })
      : MONTHS.map((name, c) => {
          const m = focusBase !== null ? focusBase + c : null;
          const value = m !== null ? series.values[m] : null;
          const clim = stats.climatology[c];
          const rel = value !== null && m !== null && !series.partial[m] && clim ? value / clim - 1 : null;
          return {
            key: name,
            label: name[0],
            rel,
            detail:
              rel === null
                ? `${MONTHS_LONG[c]}: no comparable data`
                : `${MONTHS_LONG[c]} ${focusYear}: ${fmt(value!)} hotspots, ${fmtPercent(rel)} vs ${fmt(Math.round(clim!))} average`,
            active: m !== null && m === hoverMonth,
            onHover: (on: boolean) => onHover(on && m !== null ? m : null),
          };
        });

  const slot = (W - PAD_L) / bars.length;
  const barW = Math.max(2, slot * 0.72);
  const ranked = bars.filter((b) => b.rel !== null && !b.outsideBaseline);
  const highest = ranked.reduce<Bar | null>((a, b) => (a === null || b.rel! > a.rel! ? b : a), null);
  const lowest = ranked.reduce<Bar | null>((a, b) => (a === null || b.rel! < a.rel! ? b : a), null);
  const excluded = mode === "years" && bars.some((b) => b.outsideBaseline);
  const labelled = (bar: Bar, i: number) => {
    if (mode === "months" || bar.active) return true;
    const near = bars.findIndex((b) => b.active);
    return i % 5 === 0 && (near < 0 || Math.abs(near - i) > 1);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="seg !bg-surface-2" role="group" aria-label="Compare">
          {(["years", "months"] as Mode[]).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className="!min-h-8 !px-3">
              {mode === m && (
                <motion.span
                  layoutId="anom-mode"
                  className="absolute inset-0 rounded-[9px] bg-border"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
                />
              )}
              <span className="relative">{m === "years" ? "Each year" : `Months of ${focusYear ?? "—"}`}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">vs average</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H + 16}`}
        className="block w-full"
        role="img"
        aria-label={`Anomaly vs multi-year average, ${mode === "years" ? "by year" : `by month of ${focusYear}`}`}
      >
        {[-1, -0.5, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={PAD_L}
              x2={W}
              y1={MID - ((t * MID) / LIMIT) * 0.92}
              y2={MID - ((t * MID) / LIMIT) * 0.92}
              stroke="#1B2338"
            />
            <text
              x={PAD_L - 6}
              y={MID - ((t * MID) / LIMIT) * 0.92 + 3}
              textAnchor="end"
              fontSize="8.5"
              fill="#9AA6C0"
              className="num"
            >
              {fmtPercent(t)}
            </text>
          </g>
        ))}
        <line x1={PAD_L} x2={W} y1={MID} y2={MID} stroke="#9AA6C0" strokeWidth={1} />
        <text x={PAD_L - 6} y={MID + 3} textAnchor="end" fontSize="8.5" fill="#E8ECF5">
          avg
        </text>

        <g key={`${waveKey}-${mode}-${mode === "months" ? focusYear : ""}`}>
          {bars.map((bar, i) => {
            const x = PAD_L + i * slot + (slot - barW) / 2;
            if (bar.rel === null) {
              return (
                <rect key={bar.key} x={x} y={MID - 0.75} width={barW} height={1.5} fill="#2A3350">
                  <title>{bar.detail}</title>
                </rect>
              );
            }
            const clamped = Math.max(-LIMIT, Math.min(LIMIT, bar.rel));
            const h = Math.max(1, (Math.abs(clamped) / LIMIT) * MID * 0.92);
            return (
              <motion.rect
                key={bar.key}
                x={x}
                width={barW}
                rx={1}
                initial={{ y: MID, height: 0 }}
                animate={{ y: clamped >= 0 ? MID - h : MID, height: h }}
                transition={{ delay: i * (mode === "years" ? 0.022 : 0.04), duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                fill={color(bar.rel)}
                fillOpacity={bar.outsideBaseline ? 0.35 : 1}
                stroke={bar.active ? "#FC3D21" : "none"}
                strokeWidth={1.5}
                className={bar.onSelect ? "cursor-pointer" : undefined}
                onClick={bar.onSelect}
                onPointerEnter={() => bar.onHover?.(true)}
                onPointerLeave={() => bar.onHover?.(false)}
              >
                <title>{bar.detail}</title>
              </motion.rect>
            );
          })}
        </g>
        {bars.map(
          (bar, i) =>
            labelled(bar, i) && (
              <text
                key={bar.key}
                x={PAD_L + i * slot + slot / 2}
                y={H + 12}
                textAnchor="middle"
                fontSize="8.5"
                fill={bar.active ? "#FC3D21" : "#9AA6C0"}
                fontWeight={bar.active ? 700 : 400}
                className="num"
              >
                {mode === "years" ? `’${bar.label.slice(2)}` : bar.label}
              </text>
            ),
        )}
      </svg>

      {highest && lowest && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Highest: <span className="text-text">{highest.detail}</span>
          <br />
          Lowest: <span className="text-text">{lowest.detail}</span>
        </p>
      )}
      {excluded && series.baselineNote && (
        <p className="mt-2 text-xs leading-relaxed text-muted">Faded bars: {series.baselineNote}</p>
      )}
    </div>
  );
}
