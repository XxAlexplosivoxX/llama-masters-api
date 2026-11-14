import { Map as MapIcon } from "lucide-react";
import { motion } from "motion/react";
import { SENSOR, type Sensor } from "../lib/color";
import { fmt } from "../lib/format";
import type { Explorer } from "../state";

// Every satellite FIRMS publishes near-real-time data for, so a silent one shows up as missing.
const SATELLITES: Record<Sensor, string[]> = { MODIS: ["Terra", "Aqua"], VIIRS: ["NOAA-21", "NOAA-20", "S-NPP"] };

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
});

/** Last 7 days split by sensor and satellite; switching a sensor off hides it on the map and in the CSV. */
export function RecentBySatellite({ explorer, showingOnMap, onShowOnMap }: {
  explorer: Explorer; showingOnMap: boolean; onShowOnMap: () => void;
}) {
  const { recentInArea, recentSensors, toggleRecentSensor, loaded } = explorer;
  if (!loaded?.recent) return null;

  const by = new Map<string, { n: number; last: string }>();
  for (const p of recentInArea) {
    const e = by.get(p.platform) ?? { n: 0, last: "" };
    e.n++;
    if (p.acquired_utc > e.last) e.last = p.acquired_utc;
    by.set(p.platform, e);
  }
  const max = Math.max(1, ...[...by.values()].map((e) => e.n));
  const newest = [...by.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last))[0];

  return (
    <div className="space-y-3">
      {(["VIIRS", "MODIS"] as const).map((sensor) => {
        const on = recentSensors[sensor];
        const total = SATELLITES[sensor].reduce((n, s) => n + (by.get(s)?.n ?? 0), 0);
        const { color, pixel } = SENSOR[sensor];
        return (
          <div key={sensor} className={`rounded-xl border p-3 transition-colors ${on ? "border-border bg-bg/40" : "border-border/50 opacity-60"}`}>
            <button className="flex w-full items-center gap-2.5 text-left" role="switch" aria-checked={on} onClick={() => toggleRecentSensor(sensor)}>
              <span className="relative h-5 w-9 shrink-0 rounded-full border border-border bg-surface-2" aria-hidden>
                <motion.span className="absolute top-0.5 h-3.5 w-3.5 rounded-full" animate={{ left: on ? 18 : 2, backgroundColor: on ? color : "#4A5372" }}
                  transition={{ type: "spring", bounce: 0.25, duration: 0.3 }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold" style={{ color: on ? color : undefined }}>{sensor}</span>
                <span className="block text-2xs text-muted">{pixel}</span>
              </span>
              <span className="num text-lg font-semibold">{fmt(total)}</span>
            </button>
            <ul className="mt-2.5 space-y-1.5">
              {SATELLITES[sensor].map((sat) => {
                const e = by.get(sat);
                return (
                  <li key={sat} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
                    <span className="text-muted">{sat}</span>
                    {e ? (
                      <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <motion.span className="block h-full rounded-full" style={{ background: color }}
                          initial={{ width: 0 }} animate={{ width: `${(e.n / max) * 100}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
                      </span>
                    ) : <span className="text-2xs text-muted/70">No near-real-time data this week</span>}
                    <span className="num text-right" title={e ? `Latest pass ${WHEN.format(new Date(e.last))} UTC` : undefined}>
                      {e ? fmt(e.n) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-snug text-muted">
          {newest ? <>Newest pass: <span className="text-text">{newest[0]}</span>, {WHEN.format(new Date(newest[1].last))} UTC. </> : null}
          Provisional, not added to the monthly history.
        </p>
        {!showingOnMap && (
          <button className="btn !min-h-9 shrink-0 !px-3 !text-xs" onClick={onShowOnMap}>
            <MapIcon size={14} aria-hidden /> Show on map
          </button>
        )}
      </div>
    </div>
  );
}
