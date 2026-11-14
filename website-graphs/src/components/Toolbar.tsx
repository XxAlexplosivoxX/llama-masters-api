import { useEffect, useRef, useState } from "react";
import { labelOf, SERIES_LABEL, type Range } from "../lib/shared";
import { SENSOR, ALERT } from "../lib/color";
import { INSTRUMENT, RESOLUTION, type Platform, type SeriesKind } from "../types";
import { CSV_PLACE_ID } from "../state";
import { useGraphsStore, useStore } from "../hooks/useGraphsStore";
import type { PlaceData } from "../hooks/usePlaceData";
import { DateRange } from "./DateRange";
import { PlaceSwitcher } from "./PlaceSwitcher";

const VIEWS: { kind: SeriesKind; label: string }[] = [
  { kind: "HARMONIZED", label: "Harmonized" },
  { kind: "MODIS", label: "MODIS only" },
  { kind: "VIIRS", label: "VIIRS only" },
];

export function Toolbar({ data, onUpload, uploadState }: {
  data: PlaceData;
  onUpload: (file: File | undefined) => void;
  uploadState: { info: string | null; error: string | null };
}) {
  const store = useStore();
  const placeId = useGraphsStore((s) => s.placeId);
  const areaId = useGraphsStore((s) => s.areaId);
  const platform = useGraphsStore((s) => s.platform);
  const kind = useGraphsStore((s) => s.kind);
  const range = useGraphsStore((s) => s.range);
  const fileInput = useRef<HTMLInputElement>(null);
  const [clampNote, setClampNote] = useState<string | null>(null);
  const clampTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bounds = data.seriesRange;

  // When the bounds shrink (e.g. switching to VIIRS), flag that the stored range got clipped.
  useEffect(() => {
    if (!bounds || !range || !data.series) return;
    if (range.from < bounds.from || range.to > bounds.to) {
      const from = Math.max(range.from, bounds.from), to = Math.min(range.to, bounds.to);
      setClampNote(`Adjusted to available data: ${labelOf(data.series.startYear, from)} – ${labelOf(data.series.startYear, to)}`);
      if (clampTimer.current) clearTimeout(clampTimer.current);
      clampTimer.current = setTimeout(() => setClampNote(null), 4000);
    }
  }, [bounds?.from, bounds?.to, data.series]);

  const isGrid = data.place?.kind === "grid";
  const isWeekly = data.place?.kind === "weekly";
  const isCsv = placeId === CSV_PLACE_ID;

  function applyRange(next: Range | null) {
    if (!next || !bounds) { data.setRange(null); return; }
    const clamped = {
      from: Math.min(Math.max(next.from, bounds.from), bounds.to),
      to: Math.min(Math.max(next.to, bounds.from), bounds.to),
    };
    if (clamped.from > clamped.to) clamped.to = clamped.from;
    if (data.series && (clamped.from !== next.from || clamped.to !== next.to)) {
      setClampNote(`Adjusted to available data: ${labelOf(data.series.startYear, clamped.from)} – ${labelOf(data.series.startYear, clamped.to)}`);
      if (clampTimer.current) clearTimeout(clampTimer.current);
      clampTimer.current = setTimeout(() => setClampNote(null), 4000);
    }
    data.setRange(clamped);
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <PlaceSwitcher
        places={data.places}
        current={data.place}
        csvName={data.csv?.name ?? null}
        csvSelected={isCsv}
        onSelect={data.selectPlace}
        onUpload={() => fileInput.current?.click()}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ""; }}
      />

      {isGrid && (
        <div>
          <div className="seg" role="radiogroup" aria-label="Record shown in the charts">
            {VIEWS.map((v) => (
              <button key={v.kind} role="radio" aria-checked={kind === v.kind} aria-pressed={kind === v.kind}
                onClick={() => store.actions.setKind(v.kind)}>
                {kind === v.kind && <span className="absolute inset-0 rounded-[9px] bg-grid ring-1 ring-grid" />}
                <span className="relative">{v.label}</span>
              </button>
            ))}
          </div>
          {kind === "HARMONIZED" && (
            <p className="mt-1 max-w-64 text-2xs leading-snug text-muted">
              MODIS alone before 2012, then MODIS + VIIRS on the MODIS scale.
            </p>
          )}
        </div>
      )}

      {(isWeekly || isCsv) && (
        <>
          {isWeekly && (
            <label className="grid gap-0.5 text-2xs text-muted">
              Sub-area
              <select className="field" value={areaId ?? ""} onChange={(e) => store.actions.setArea(e.target.value || null)}>
                {data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          <label className="grid gap-0.5 text-2xs text-muted">
            Satellite
            <span className="flex items-center gap-1.5">
              <select className="field" value={platform} onChange={(e) => store.actions.setPlatform(e.target.value)}>
                {(["Terra", "Aqua", "S-NPP", "NOAA-20", "NOAA-21"] as Platform[]).map((p) => (
                  <option key={p} value={p} disabled={!data.platforms.includes(p)}>
                    {p} · {INSTRUMENT[p]} {RESOLUTION[p]}
                  </option>
                ))}
              </select>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SENSOR[platform as Platform] }} aria-hidden />
            </span>
          </label>
        </>
      )}

      {data.series && bounds && data.range && (
        <div className="min-w-72 flex-1">
          <DateRange
            startYear={data.series.startYear}
            bounds={bounds}
            range={range && { from: Math.max(range.from, bounds.from), to: Math.min(range.to, bounds.to) } || bounds}
            baselineFrom={data.series.baselineFrom}
            focusYear={data.focus}
            onRange={applyRange}
          />
          {clampNote && <p className="mt-1 text-2xs" style={{ color: ALERT }} role="status">{clampNote}</p>}
          {uploadState.error && <p className="mt-1 text-2xs text-alert" role="alert">{uploadState.error}</p>}
          {uploadState.info && !uploadState.error && <p className="mt-1 text-2xs text-muted" role="status">{uploadState.info}</p>}
        </div>
      )}
      <span className="sr-only">{data.series ? SERIES_LABEL[kind] : ""}</span>
    </div>
  );
}
