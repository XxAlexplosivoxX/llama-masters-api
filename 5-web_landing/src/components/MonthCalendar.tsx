import { motion, useReducedMotion } from "motion/react";
import { heat, MONTHS, short } from "../lib/heat";

/** A typical year as twelve tiles: the whole record folded into one calendar page. */
export function MonthCalendar({ months, label }: { months: number[]; label: string }) {
  const still = useReducedMotion();
  const max = Math.max(...months, 0);
  const peak = max > 0 ? months.indexOf(max) : -1;
  return (
    <figure className="m-0">
      <ol
        key={label}
        className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 sm:gap-3"
        aria-label={`A typical year of hotspots in ${label}, month by month`}
      >
        {months.map((value, m) => {
          const share = max > 0 ? value / max : 0;
          const bright = share > 0.42; // the ramp turns light here: dark text from then on
          return (
            <motion.li
              key={MONTHS[m]}
              initial={still ? false : { opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: m * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className={`relative flex aspect-[4/3] flex-col justify-between rounded-2xl p-3 sm:p-4 ${
                bright ? "text-bg" : "text-text"
              } ${m === peak ? "ring-2 ring-heat-6 ring-offset-2 ring-offset-bg" : ""}`}
              style={{ backgroundColor: heat(share) }}
            >
              <span className="text-sm font-semibold sm:text-base">{MONTHS[m]}</span>
              <span className="text-lg font-bold tabular-nums leading-none tracking-tight sm:text-2xl">
                {short(value)}
              </span>
              {m === peak && (
                <span className="absolute right-3 top-3 text-[0.65rem] font-bold uppercase tracking-wider sm:right-4 sm:top-4">
                  Peak
                </span>
              )}
            </motion.li>
          );
        })}
      </ol>
      <figcaption className="mt-4 text-sm text-muted">A typical year. Median hotspots in each month.</figcaption>
    </figure>
  );
}
