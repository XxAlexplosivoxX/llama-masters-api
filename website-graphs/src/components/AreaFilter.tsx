import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlaceData } from "../hooks/usePlaceData";
import { useStore } from "../hooks/useGraphsStore";
import { fmt } from "../lib/format";
import type { BBox } from "../state";

/** Below this many 0.5° cells the per-month MODIS/VIIRS conversion is fitted on far more data than it is applied to. */
export const SMALL_AREA_CELLS = 12;

const FIELDS = [
  { key: 1, label: "Lat min", min: -90, max: 90 },
  { key: 3, label: "Lat max", min: -90, max: 90 },
  { key: 0, label: "Lon min", min: -180, max: 180 },
  { key: 2, label: "Lon max", min: -180, max: 180 },
] as const;

const round = (v: number) => String(Math.round(v * 100) / 100);

function validate(draft: string[]): { bbox: BBox } | { error: string } {
  const v = draft.map(Number);
  for (const f of FIELDS) {
    const x = v[f.key];
    if (draft[f.key].trim() === "" || !Number.isFinite(x)) return { error: `${f.label} must be a number.` };
    if (x < f.min || x > f.max) return { error: `${f.label} must be between ${f.min} and ${f.max}.` };
  }
  if (v[1] >= v[3]) return { error: "Lat min must be below lat max." };
  if (v[0] >= v[2]) return { error: "Lon min must be below lon max." };
  return { bbox: v as BBox };
}

/** Bounding-box area of interest for gridded places: every chart then uses only the cells inside it. */
export function AreaFilter({ data }: { data: PlaceData }) {
  const set = useStore().actions;
  const { loaded, bbox, cells, harmonization } = data;
  const grid = loaded && "grid" in loaded ? loaded.grid : null;
  const placeBox = loaded?.place.bbox ?? null;
  const shown = bbox ?? placeBox;
  const [draft, setDraft] = useState<string[]>(() => (shown ?? [0, 0, 0, 0]).map(round));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (shown) setDraft(shown.map(round)); setError(null); }, [shown?.join()]);

  if (!grid || !placeBox) return null;

  const apply = () => {
    const result = validate(draft);
    if ("error" in result) { setError(result.error); return; }
    setError(null);
    set.setBbox(result.bbox);
  };
  const small = bbox !== null && cells.length > 0 && (cells.length < SMALL_AREA_CELLS || harmonization?.check === null);

  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Area of interest</div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); apply(); }}
        aria-label="Area of interest bounding box">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col text-xs text-muted">
            {f.label}
            <input
              className="field num mt-1 w-24" type="number" step="0.5" min={f.min} max={f.max}
              value={draft[f.key]} aria-invalid={!!error}
              onChange={(e) => setDraft((d) => d.map((x, i) => (i === f.key ? e.target.value : x)))}
            />
          </label>
        ))}
        <button type="submit" className="field font-medium text-text hover:border-muted">Apply</button>
        <button type="button" className="field text-muted hover:text-text disabled:opacity-40" disabled={!bbox}
          onClick={() => set.setBbox(null)}>
          Reset to whole place
        </button>
      </form>
      <p className="mt-1.5 text-xs text-muted" role="status">
        {bbox ? `${fmt(cells.length)} of ${fmt(grid.cells.length)}` : `All ${fmt(grid.cells.length)}`} grid cells of {grid.cell_deg}° included
        {" "}(a cell counts when its centre is inside the box).
      </p>
      {error && <p className="mt-1 text-xs text-alert" role="alert">{error}</p>}
      {small && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-alert">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          Small area: the MODIS/VIIRS conversion is less reliable here.
        </p>
      )}
    </div>
  );
}
