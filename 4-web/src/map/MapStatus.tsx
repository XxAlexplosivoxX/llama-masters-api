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

/** First-load pill at the top middle: one line naming the current step, a thin progress line under it. */
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
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
      transition={{ duration: 0.3, ease }}
      className="relative flex h-9 max-w-[calc(100vw-2rem)] items-center gap-2 overflow-hidden rounded-full border border-border bg-bg/90 pl-3 pr-4 text-xs shadow-xl shadow-black/40 backdrop-blur-md"
    >
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="truncate"
        >
          {label}
        </motion.span>
      </AnimatePresence>
      {detail && <span className="num shrink-0 text-muted">{detail}</span>}
      <motion.span
        className="absolute bottom-0 left-0 h-0.5 bg-accent"
        animate={{ width: `${Math.max(4, shownProgress * 100)}%` }}
        transition={{ duration: 0.3 }}
        aria-hidden
      />
    </motion.div>
  );
}

/** One line under the toolbar that says what the map is doing right now. */
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
          className="relative overflow-hidden rounded-lg border border-border bg-bg/85 px-3 py-1.5 text-center text-xs backdrop-blur-md"
        >
          <span className="num">{text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
