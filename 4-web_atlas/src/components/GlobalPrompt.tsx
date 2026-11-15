import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Explorer } from "../state";

const pop = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};

/**
 * Global's messages under the toolbar: how to pick, a warning before a load that may slow the map
 * down, or why nothing was picked. Only the countries picked are ever downloaded.
 */
export function GlobalPrompt({ explorer }: { explorer: Explorer }) {
  const { isGlobal, pending, notice, picks, status } = explorer;
  if (!isGlobal) return null;
  const hint = !pending && !notice && !picks.length && status.kind !== "loading";
  return (
    <AnimatePresence mode="wait">
      {pending ? (
        <motion.div
          {...pop}
          key="pending"
          role="alertdialog"
          aria-label="Performance warning"
          className="w-80 max-w-full rounded-xl border border-border bg-bg/90 p-3.5 text-sm shadow-2xl shadow-black/40 backdrop-blur-md"
        >
          <p className="font-semibold">This may slow down the map</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Loading several countries at once can make the map freeze for a moment.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn !min-h-9 text-xs" onClick={explorer.cancelPending}>
              Cancel
            </button>
            <button
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-[#06102A] hover:bg-accent/90"
              onClick={explorer.confirmPending}
              autoFocus
            >
              Load anyway
            </button>
          </div>
        </motion.div>
      ) : notice ? (
        <motion.div
          {...pop}
          key={notice}
          role="status"
          className="flex w-80 max-w-full items-start gap-2 rounded-xl border border-border bg-bg/90 py-2.5 pl-3.5 pr-1.5 text-xs text-muted backdrop-blur-md"
        >
          <span className="min-w-0 flex-1 leading-relaxed">{notice}</span>
          <button
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md hover:bg-surface-2 hover:text-text"
            onClick={explorer.dismissNotice}
            aria-label="Dismiss"
          >
            <X size={14} aria-hidden />
          </button>
        </motion.div>
      ) : hint ? (
        <motion.p
          {...pop}
          key="hint"
          role="status"
          className="w-80 max-w-full rounded-xl border border-border bg-bg/90 px-3.5 py-2.5 text-xs leading-relaxed text-muted backdrop-blur-md"
        >
          <span className="font-semibold text-text">Global.</span> Click countries on the map, or use Select area to
          draw across borders. Only the countries you pick are downloaded.
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
