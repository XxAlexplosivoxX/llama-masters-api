import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useWidth } from "../../hooks/useWidth";
import { seamSeries } from "../../lib/series";
import type { Explorer } from "../../state";
import { LatestMonth } from "./LatestMonth";
import { Seasonal } from "./Seasonal";
import { Sensors } from "./Sensors";
import { transition } from "./plot";

const tabs = ["Seasonal pattern", "This month vs past years", "MODIS vs VIIRS"];

export function Charts({ explorer, showingRecent }: { explorer: Explorer; showingRecent: boolean }) {
  const { loaded, series, stats, range, focus } = explorer;
  const { ref, width } = useWidth();
  const id = useId();
  const [tab, setTab] = useState(0);
  // the seam check is exported per country (and state), not per drawn area
  const monthly = useMemo(
    () => (loaded && !explorer.shape ? seamSeries(loaded.monthly) : null),
    [loaded, explorer.shape],
  );
  const active = tab === 2 && !monthly ? 0 : tab;
  const selection = useMemo(() => JSON.stringify(explorer.shape?.polygon ?? null), [explorer.shape]);
  const animationKey = `${explorer.place?.id}:${selection}:${explorer.kind}:${focus}:${range?.from}:${range?.to}`;
  const clear = useRef(() => {});
  clear.current = () => {
    if (!showingRecent) explorer.setHoverMonth(null);
  };
  useEffect(() => {
    clear.current();
    return () => clear.current();
  }, [animationKey, active]);
  const select = (next: number) => {
    clear.current();
    setTab(next);
  };
  const count = monthly ? 3 : 2;
  return (
    <div ref={ref} className="charts min-w-0 num">
      <div className="seg chart-tabs" role="tablist" aria-label="Charts">
        {tabs.slice(0, count).map((label, i) => (
          <button
            key={label}
            id={`${id}-tab-${i}`}
            role="tab"
            aria-selected={active === i}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={active === i ? 0 : -1}
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
            key={active}
            role="tabpanel"
            id={`${id}-panel-${active}`}
            aria-labelledby={`${id}-tab-${active}`}
            tabIndex={0}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            {active === 0 && (
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
            {active === 1 && (
              <LatestMonth
                series={series}
                stats={stats}
                focus={focus}
                range={range}
                width={width}
                animationKey={animationKey}
              />
            )}
            {active === 2 && monthly && (
              <Sensors monthly={monthly} range={range} width={width} animationKey={animationKey} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
