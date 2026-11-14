import { AnimatePresence, motion } from "motion/react";
import { HEAT, HEAT_ZERO, SENSOR } from "../lib/color";
import { fmt, fmtCompact } from "../lib/format";
import { labelOf, MONTHS_LONG, SERIES_LABEL } from "../lib/series";
import type { MapLayer } from "../map/engine";
import type { Explorer } from "../state";

export function Legend({ explorer, layer, gridMax }: { explorer: Explorer; layer: MapLayer; gridMax: number }) {
  const { loaded, series, range, hoverMonth, recent, shape, kind } = explorer;
  const isGrid = loaded && "grid" in loaded;
  const first = loaded?.recent?.[0]?.acquired_utc.slice(0, 10);
  const last = loaded?.recent?.at(-1)?.acquired_utc.slice(0, 10);

  let title = "";
  let detail = "";
  if (layer === "history" && isGrid && series && range) {
    title = hoverMonth !== null
      ? `${MONTHS_LONG[hoverMonth % 12]} ${series.startYear + Math.floor(hoverMonth / 12)}`
      : `${labelOf(series.startYear, range.from)} to ${labelOf(series.startYear, range.to)}`;
    detail = `${SERIES_LABEL[kind]} detections per ${loaded.grid.cell_deg}° cell${shape ? ", this area only" : ""}`;
  } else if (layer === "recent") {
    title = first ? `${first} to ${last} (UTC)` : "Last 7 days";
    detail = loaded?.recent
      ? `${fmt(recent.length)} detections${shape ? " in this area" : ""}${!explorer.recentSensors.MODIS ? ", VIIRS only" : !explorer.recentSensors.VIIRS ? ", MODIS only" : ""}`
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
      {layer === "history" ? (
        <>
          <div className="mt-2 h-2 rounded-sm" style={{ background: `linear-gradient(90deg, ${HEAT_ZERO}, ${HEAT.join(",")})` }} />
          <div className="mt-1 flex justify-between text-2xs text-muted num">
            <span>1</span>
            <span>{`${fmtCompact(gridMax)}+`}</span>
          </div>
        </>
      ) : (
        <div className="mt-2 flex items-center gap-4 text-xs">
          {(["VIIRS", "MODIS"] as const).map((s) => (
            <span key={s} className={`inline-flex items-center gap-1.5 ${explorer.recentSensors[s] ? "" : "opacity-40 line-through"}`}>
              <span className="inline-block rounded-full" aria-hidden style={s === "MODIS"
                ? { width: 11, height: 11, background: `${SENSOR.MODIS.color}80`, border: `1.5px solid ${SENSOR.MODIS.color}` }
                : { width: 7, height: 7, background: SENSOR.VIIRS.color }} />
              {s}
            </span>
          ))}
          <span className="ml-auto text-2xs text-muted">Size: fire power</span>
        </div>
      )}
    </div>
  );
}
