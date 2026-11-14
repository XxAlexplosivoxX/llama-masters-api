import { Pause, Play, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { labelOf, MONTHS_LONG } from "../lib/series";
import type { Explorer } from "../state";

const SPEEDS = [1, 2, 4];

/**
 * Month-by-month playback for the map, like a weather radar loop. Collapsed it is a single
 * "Play" button; once started it shows the month, a scrubber over the selected dates and the speed.
 */
export function Timeline({ explorer, onPlay }: { explorer: Explorer; onPlay: () => void }) {
  const { series, range, hoverMonth, playing, speed, setSpeed, pause, seek, stopPlayback } = explorer;
  if (!series || !range || range.to <= range.from) return null;
  const active = playing || (hoverMonth !== null && explorer.timelineOpen);
  const month = hoverMonth ?? range.from;
  const year = series.startYear + Math.floor(month / 12);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!active ? (
        <motion.button key="closed" onClick={onPlay}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2 }}
          className="pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-bg/85 px-3.5 text-sm font-semibold backdrop-blur-md hover:border-muted"
          title="Play the map month by month">
          <Play size={15} className="fill-current" aria-hidden /> Play month by month
        </motion.button>
      ) : (
        <motion.div key="open" role="group" aria-label="Month by month playback"
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2 }}
          className="pointer-events-auto flex w-[min(34rem,100%)] items-center gap-2 rounded-xl sm:gap-3 border border-border bg-bg/90 px-2.5 py-2 backdrop-blur-md">
          <button onClick={playing ? pause : onPlay} aria-label={playing ? "Pause" : "Play"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-[#06102A] hover:bg-[#6AA1FF]">
            {playing ? <Pause size={16} className="fill-current" aria-hidden /> : <Play size={16} className="fill-current" aria-hidden />}
          </button>
          <div className="w-[4.75rem] shrink-0 sm:w-[6.5rem]" aria-live="off">
            <div className="num text-sm font-semibold leading-tight">{MONTHS_LONG[month % 12]}</div>
            <div className="num text-xs text-muted">{year}</div>
          </div>
          <div className="min-w-0 flex-1">
            <input type="range" className="timeline w-full" min={range.from} max={range.to} step={1} value={month}
              aria-label="Month" aria-valuetext={labelOf(series.startYear, month)}
              onChange={(e) => { pause(); seek(Number(e.target.value)); }} />
            <div className="num hidden justify-between text-2xs text-muted sm:flex">
              <span>{labelOf(series.startYear, range.from)}</span>
              <span>{labelOf(series.startYear, range.to)}</span>
            </div>
          </div>
          <div className="flex shrink-0 rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)}
                className={`num rounded-md px-1.5 py-0.5 text-xs ${speed === s ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}>
                {s}×
              </button>
            ))}
          </div>
          <button onClick={stopPlayback} aria-label="Close playback and show the totals again" title="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
            <X size={16} aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
