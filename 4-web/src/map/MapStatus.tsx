import { Check } from "lucide-react";
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

/** First-load card: what is loading, in which order, and how far along each download is. */
export function LoadingCard({ title, steps }: { title: string; steps: Step[] }) {
  const known = steps.filter((s) => s.fraction !== undefined || s.state === "done");
  const overall = known.length
    ? known.reduce((sum, s) => sum + (s.state === "done" ? 1 : (s.fraction ?? 0)), 0) / steps.length
    : 0;
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
      transition={{ duration: 0.4, ease }}
      className="w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface/95 p-4 shadow-2xl shadow-black/50 backdrop-blur"
    >
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${Math.max(4, overall * 100)}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <ol className="mt-3 space-y-1.5 text-xs">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="grid h-4 w-4 shrink-0 place-items-center" aria-hidden>
              {s.state === "done" ? (
                <Check size={13} className="text-accent" />
              ) : s.state === "active" ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              ) : (
                <span className="h-2 w-2 rounded-full border border-muted/60" />
              )}
            </span>
            <span className={s.state === "waiting" ? "text-muted" : "text-text"}>{s.label}</span>
            {s.detail && <span className="num ml-auto text-muted">{s.detail}</span>}
          </li>
        ))}
      </ol>
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
