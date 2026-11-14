import { AnimatePresence, motion } from "motion/react";
import { HEAT, HEAT_ZERO } from "../lib/color";
import { fmt, fmtCompact } from "../lib/format";
import { labelOf, MONTHS_LONG } from "../lib/series";
import type { MapLayer } from "../map/engine";
import type { Explorer } from "../state";

export function Legend({ explorer, layer, gridMax }: { explorer: Explorer; layer: MapLayer; gridMax: number }) {
  const { loaded, series, range, hoverMonth, recent, shape } = explorer;
  const isGrid = loaded && "grid" in loaded;
  const first = loaded?.recent?.[0]?.acquired_utc.slice(0, 10);
  const last = loaded?.recent?.at(-1)?.acquired_utc.slice(0, 10);

  let title = "";
  let detail = "";
  if (layer === "history" && isGrid && series && range) {
    title = hoverMonth !== null
      ? `${MONTHS_LONG[hoverMonth % 12]} ${series.startYear + Math.floor(hoverMonth / 12)}`
      : `${labelOf(series.startYear, range.from)} to ${labelOf(series.startYear, range.to)}`;
    detail = `Detections per ${loaded.grid.cell_deg}° cell, MODIS`;
  } else if (layer === "recent") {
    title = first ? `${first} to ${last} (UTC)` : "Last 7 days";
    detail = loaded?.recent
      ? `${fmt(recent.length)} MODIS and VIIRS detections${shape ? " in this area" : ""}`
      : "This region has no recent detections export";
  }
  if (!title) return null;

  return (
    <div className="pointer-events-auto w-64 rounded-xl border border-border bg-bg/85 px-3.5 py-3 backdrop-blur-md">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
          <div className="text-sm font-semibold num">{title}</div>
        </motion.div>
      </AnimatePresence>
      <div className="text-xs text-muted">{detail}</div>
      <div className="mt-2 h-2 rounded-sm" style={{ background: `linear-gradient(90deg, ${layer === "history" ? HEAT_ZERO : "transparent"}, ${HEAT.join(",")})` }} />
      <div className="mt-1 flex justify-between text-2xs text-muted num">
        <span>{layer === "history" ? "1" : "Sparse"}</span>
        <span>{layer === "history" ? `${fmtCompact(gridMax)}+` : "Dense, high power"}</span>
      </div>
    </div>
  );
}
