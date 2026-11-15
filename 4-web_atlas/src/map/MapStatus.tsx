import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LoadProgress } from "../lib/data";

const MB = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const ease = [0.22, 1, 0.36, 1] as const;

export interface Step {
  label: string;
  state: "done" | "active" | "waiting";
  detail?: string;
  fraction?: number; // 0..1 when the size is known
}

export function stepsFrom(
  basemapReady: boolean,
  dataReady: boolean,
  progress: LoadProgress[] | undefined,
  placeLabel: string,
): Step[] {
  const steps: Step[] = [{ label: "Basemap", state: basemapReady ? "done" : "active" }];
  const names: Record<LoadProgress["step"], string> = {
    history: `Monthly fire history for ${placeLabel}`,
    recent: "Last 7 days of hotspots",
  };
  for (const p of progress ??
    ([
      { step: "history", label: "", loaded: 0, total: null },
      { step: "recent", label: "", loaded: 0, total: null },
    ] as LoadProgress[])) {
    const done = dataReady || (p.total !== null && p.loaded >= p.total && p.loaded > 0);
    steps.push({
      label: names[p.step],
      state: done ? "done" : p.loaded > 0 ? "active" : "waiting",
      detail: !dataReady && p.loaded > 0 ? (p.total ? `${MB(p.loaded)} of ${MB(p.total)}` : MB(p.loaded)) : undefined,
      fraction: p.total ? Math.min(1, p.loaded / p.total) : undefined,
    });
  }
  return steps;
}

const MESSAGE_MS = 700; // each loading message stays at least this long, so it can be read

/** First-load pill at the top middle: a progress ring and one line naming the current step. */
export function LoadingCard({ title, steps, onFinished }: { title: string; steps: Step[]; onFinished?: () => void }) {
  const known = steps.filter((s) => s.fraction !== undefined || s.state === "done");
  const overall = known.length
    ? known.reduce((sum, s) => sum + (s.state === "done" ? 1 : (s.fraction ?? 0)), 0) / steps.length
    : 0;
  // The steps are named one after another, each for at least MESSAGE_MS, even when the cache makes
  // them finish at once; the pill reports `onFinished` after the last one has been shown.
  const [index, setIndex] = useState(0);
  const since = useRef(performance.now());
  const doneNow = index < steps.length && steps[index].state === "done";
  useEffect(() => {
    if (index >= steps.length) {
      onFinished?.();
      return;
    }
    if (!doneNow) return;
    const id = window.setTimeout(
      () => {
        since.current = performance.now();
        setIndex((i) => i + 1);
      },
      Math.max(0, since.current + MESSAGE_MS - performance.now()),
    );
    return () => window.clearTimeout(id);
  }, [index, doneNow, steps.length]);
  const step = steps[Math.min(index, steps.length - 1)];
  const label = step ? `Loading ${step.label.charAt(0).toLowerCase()}${step.label.slice(1)}` : title;
  const detail = step?.state === "active" ? step.detail : undefined;
  const shownProgress = Math.max(overall, Math.min(1, index / steps.length));
  // Ring: the arc is the progress; the whole ring turns slowly so it reads as busy.
  const R = 6,
    C = 2 * Math.PI * R;
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.25 } }}
      transition={{ duration: 0.3, ease }}
      className="flex h-8 max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-white/10 bg-bg/80 pl-2.5 pr-3.5 text-xs shadow-lg shadow-black/30 backdrop-blur-md"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="shrink-0 animate-spin [animation-duration:1.4s]"
        aria-hidden
      >
        <circle cx="8" cy="8" r={R} fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
        <motion.circle
          cx="8"
          cy="8"
          r={R}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - Math.max(0.12, shownProgress)) }}
          transition={{ duration: 0.4, ease }}
          transform="rotate(-90 8 8)"
        />
      </svg>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.18 }}
          className="truncate text-text/90"
        >
          {label}
        </motion.span>
      </AnimatePresence>
      {detail && <span className="num shrink-0 text-muted">{detail}</span>}
    </motion.div>
  );
}

/** One line in the loading pill's top-centre position that says what the map is doing right now. */
export function MapCaption({ text }: { text: string | null }) {
  return (
    <AnimatePresence mode="wait">
      {text && (
        <motion.div
          key={text.split(":")[0]}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease }}
          className="flex h-8 items-center overflow-hidden rounded-full border border-white/10 bg-bg/80 px-3.5 text-center text-xs text-text/90 shadow-lg shadow-black/30 backdrop-blur-md"
        >
          <span className="num truncate">{text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
