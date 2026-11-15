import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useWidth } from "../../hooks/useWidth";
import type { Explorer } from "../../state";
import { LatestMonth } from "./LatestMonth";
import { Seasonal } from "./Seasonal";
import { transition } from "./plot";

const tabs = ["Seasonal pattern", "This month"];

export function Charts({ explorer, showingRecent }: { explorer: Explorer; showingRecent: boolean }) {
  const { series, stats, range, focus } = explorer;
  const { ref, width } = useWidth();
  const id = useId();
  const [tab, setTab] = useState(0);
  const selection = useMemo(() => JSON.stringify(explorer.shape?.polygon ?? null), [explorer.shape]);
  const animationKey = `${explorer.place?.id}:${selection}:${explorer.kind}:${focus}:${range?.from}:${range?.to}`;
  const clear = useRef(() => {});
  clear.current = () => {
    if (!showingRecent) explorer.setHoverMonth(null);
  };
  useEffect(() => {
    clear.current();
    return () => clear.current();
  }, [animationKey, tab]);
  const select = (next: number) => {
    clear.current();
    setTab(next);
  };
  const count = tabs.length;
  return (
    <div ref={ref} className="charts min-w-0 num">
      <div className="seg chart-tabs" role="tablist" aria-label="Charts">
        {tabs.map((label, i) => (
          <button
            key={label}
            id={`${id}-tab-${i}`}
            role="tab"
            aria-selected={tab === i}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={tab === i ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? count - 1
                    : (i + (e.key === "ArrowLeft" ? -1 : 1) + count) % count;
              select(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {series && stats && range && width > 0 && (
          <motion.div
            key={tab}
            role="tabpanel"
            id={`${id}-panel-${tab}`}
            aria-labelledby={`${id}-tab-${tab}`}
            tabIndex={0}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            {tab === 0 && (
              <Seasonal
                key={animationKey}
                series={series}
                stats={stats}
                focus={focus}
                range={range}
                width={width}
                animationKey={animationKey}
                onHover={showingRecent ? () => {} : explorer.setHoverMonth}
              />
            )}
            {tab === 1 && (
              <LatestMonth
                series={series}
                stats={stats}
                focus={focus}
                range={range}
                width={width}
                animationKey={animationKey}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
