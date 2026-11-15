import { Pause, Play, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { labelOf, MONTHS_LONG } from "../lib/series";
import type { Explorer } from "../state";

const SPEEDS = [0.5, 1, 2, 4];

/**
 * Month-by-month playback for the map, like a weather radar loop. Started from the toolbar's Play
 * button (`PlayButton`); shows the month, a scrubber over the selected dates and the speed.
 */
export function Timeline({ explorer, onPlay }: { explorer: Explorer; onPlay: () => void }) {
  const { series, range, playbackMonth, playing, speed, setSpeed, pause, seek, stopPlayback } = explorer;
  if (!series || !range || range.to <= range.from) return null;
  const active = explorer.timelineOpen;
  const month = playbackMonth;
  const year = series.startYear + Math.floor(month / 12);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {active && (
        <motion.div
          key="open"
          role="group"
          aria-label="Month by month playback"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2 }}
          className="timeline-player pointer-events-auto grid w-full max-w-[34rem] items-center gap-2 rounded-xl border border-border bg-bg/90 px-2.5 py-2 backdrop-blur-md"
        >
          <button
            onClick={playing ? pause : onPlay}
            aria-label={playing ? "Pause" : "Play"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-[#06102A] hover:bg-[#6AA1FF]"
          >
            {playing ? (
              <Pause size={16} className="fill-current" aria-hidden />
            ) : (
              <Play size={16} className="fill-current" aria-hidden />
            )}
          </button>
          <div className="min-w-0" aria-live="off">
            <div className="num text-sm font-semibold leading-tight">{MONTHS_LONG[month % 12]}</div>
            <div className="num text-xs text-muted">{year}</div>
          </div>
          <div className="timeline-track min-w-0">
            <input
              type="range"
              className="timeline w-full"
              min={range.from}
              max={range.to}
              step={1}
              value={month}
              aria-label="Month"
              aria-valuetext={labelOf(series.startYear, month)}
              onChange={(e) => {
                pause();
                seek(Number(e.target.value));
              }}
            />
            <div className="num hidden justify-between text-2xs text-muted sm:flex">
              <span>{labelOf(series.startYear, range.from)}</span>
              <span>{labelOf(series.startYear, range.to)}</span>
            </div>
          </div>
          <div
            className="timeline-speeds flex rounded-lg border border-border p-0.5"
            role="radiogroup"
            aria-label="Speed"
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={speed === s}
                onClick={() => setSpeed(s)}
                className={`num min-h-9 min-w-0 flex-1 rounded-md px-1.5 text-xs ${speed === s ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            onClick={stopPlayback}
            aria-label="Close playback and show the totals again"
            title="Close"
            className="timeline-close grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Toolbar button that starts (or pauses) the month-by-month playback. */
export function PlayButton({ explorer, onPlay }: { explorer: Explorer; onPlay: () => void }) {
  const { series, range, playing, pause } = explorer;
  if (!series || !range || range.to <= range.from) return null;
  return (
    <div className="seg" data-tour="play">
      <button
        onClick={playing ? pause : onPlay}
        aria-pressed={playing}
        title={playing ? "Pause" : "Play the map month by month"}
        className="max-sm:w-10 max-sm:justify-center max-sm:!px-0"
      >
        <span className="relative inline-flex items-center gap-1.5">
          {playing ? (
            <Pause size={15} className="fill-current" aria-hidden />
          ) : (
            <Play size={15} className="fill-current" aria-hidden />
          )}
          <span className="max-sm:hidden">{playing ? "Pause" : "Play"}</span>
        </span>
      </button>
    </div>
  );
}
