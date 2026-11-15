import { Download } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { download, hotspotRows, monthlyRows, slug } from "../lib/csv";
import { fmt } from "../lib/format";
import { gridSeries } from "../lib/series";
import type { Explorer } from "../state";

export function Export({ explorer }: { explorer: Explorer }) {
  const { series, stats, range, selectionLabel, recent, loaded, shape } = explorer;
  const [note, setNote] = useState("");

  const columns = (): Record<string, (number | string | null)[]> => {
    if (!loaded || !explorer.values) return {};
    const { grid } = loaded,
      v = explorer.values,
      cells = explorer.cells;
    return {
      harmonized_noaa20_scale: gridSeries(grid, v.HARMONIZED, cells, "HARMONIZED").values,
      modis_detections: gridSeries(grid, v.MODIS, cells, "MODIS").values,
      viirs_observed_noaa20_scale: gridSeries(grid, v.VIIRS, cells, "VIIRS").values,
      record_source: grid.source,
      record_satellite: grid.satellite,
    };
  };

  const name = slug(`${loaded?.place.label ?? "area"}-${shape ? "drawn-area" : "all"}`);

  function exportPoints() {
    if (!loaded) return;
    download(`${name}-hotspots-last-7-days.csv`, hotspotRows(recent));
    setNote(`Downloaded ${fmt(recent.length)} hotspots.`);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn btn-primary"
          disabled={!series || !stats || !range}
          onClick={() => {
            download(`${name}-monthly.csv`, monthlyRows(series!, stats!, range!, selectionLabel, columns()));
            setNote(`Downloaded ${range!.to - range!.from + 1} months for ${selectionLabel}.`);
          }}
        >
          <Download size={16} aria-hidden /> Monthly counts
        </button>
        <button className="btn" disabled={!recent.length} onClick={exportPoints}>
          <Download size={16} aria-hidden />
          Hotspots, last 7 days
        </button>
      </div>
      <AnimatePresence>
        {note && (
          <motion.p
            key={note}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-xs text-muted"
            role="status"
          >
            {note}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
