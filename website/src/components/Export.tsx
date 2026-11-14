import { Download, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { download, hotspotRows, monthlyRows, slug } from "../lib/csv";
import { fetchHotspots, usingApi } from "../lib/data";
import { fmt } from "../lib/format";
import { bboxOf, contains } from "../lib/geo";
import type { Explorer } from "../state";

export function Export({ explorer }: { explorer: Explorer }) {
  const { series, stats, range, selectionLabel, recent, loaded, shape } = explorer;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const name = slug(`${loaded?.place.label ?? "area"}-${shape ? "drawn-area" : "all"}`);

  async function exportPoints() {
    if (!loaded) return;
    setNote("");
    // Contract regions on the API: let the server filter by bbox and report truncation.
    if (loaded.place.kind === "weekly" && usingApi()) {
      setBusy(true);
      try {
        const result = await fetchHotspots(loaded.place, shape ? bboxOf(shape.polygon) : null);
        if (!result) { setNote("This region has no hotspot export on the server."); return; }
        const points = shape ? result.points.filter((p) => contains(shape.polygon, p.lon, p.lat)) : result.points;
        download(`${name}-hotspots.csv`, hotspotRows(points));
        setNote(result.truncated
          ? `Downloaded ${fmt(points.length)} detections. The server capped the result: draw a smaller area for the full list.`
          : `Downloaded ${fmt(points.length)} detections.`);
      } catch (error) {
        setNote(`Download failed: ${String(error)}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    download(`${name}-hotspots-last-7-days.csv`, hotspotRows(recent));
    setNote(`Downloaded ${fmt(recent.length)} detections.`);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn btn-primary"
          disabled={!series || !stats || !range}
          onClick={() => {
            download(`${name}-monthly.csv`, monthlyRows(series!, stats!, range!, selectionLabel));
            setNote(`Downloaded ${range!.to - range!.from + 1} months for ${selectionLabel}.`);
          }}
        >
          <Download size={16} aria-hidden /> Monthly counts
        </button>
        <button className="btn" disabled={busy || (!recent.length && !(loaded?.place.kind === "weekly" && usingApi()))} onClick={exportPoints}>
          {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />}
          Hotspots, last 7 days
        </button>
      </div>
      <AnimatePresence>
        {note && (
          <motion.p
            key={note}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-2 text-xs text-muted" role="status"
          >
            {note}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
