import { MUTED } from "../lib/color";

/** Gradient legend with numeric ticks placed at fractions (0..1) of its width. */
export function Ramp({ label, stops, ticks }: { label: string; stops: string[]; ticks: { at: number; text: string }[] }) {
  const id = `ramp-${label.replace(/\W+/g, "-")}`;
  return (
    <span className="inline-flex flex-col gap-0.5" role="img" aria-label={`${label}: ${ticks.map((t) => t.text).join(", ")}`}>
      <span>{label}</span>
      <svg width="200" height="26" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" x2="1">
            {stops.map((c, i) => <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />)}
          </linearGradient>
        </defs>
        <rect x="6" width="188" height="9" rx="2" fill={`url(#${id})`} />
        {ticks.map((t) => (
          <g key={t.text} transform={`translate(${6 + t.at * 188},0)`}>
            <line y1="9" y2="13" stroke={MUTED} />
            <text y="24" fontSize={12} fill={MUTED} className="num"
              textAnchor={t.at === 0 ? "start" : t.at === 1 ? "end" : "middle"}>{t.text}</text>
          </g>
        ))}
      </svg>
    </span>
  );
}
