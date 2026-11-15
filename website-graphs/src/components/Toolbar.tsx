import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useGraphsStore, useStore } from "../hooks/useGraphsStore";
import type { PlaceData } from "../hooks/usePlaceData";
import { fullRange, labelOf } from "../lib/shared";
import type { SeriesKind } from "../types";
import { AreaFilter } from "./AreaFilter";
import { DateRange } from "./DateRange";
import { ExportMenu } from "./ExportMenu";
import { PlaceSwitcher } from "./PlaceSwitcher";

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{children}</div>;
}

interface Props {
  data: PlaceData;
  onUpload: (file: File | undefined) => void;
  uploadState: { info: string | null; error: string | null };
}

export function Toolbar({ data, onUpload, uploadState }: Props) {
  const areaId = useGraphsStore((s) => s.areaId);
  const platform = useGraphsStore((s) => s.platform);
  const kind = useGraphsStore((s) => s.kind);
  const range = useGraphsStore((s) => s.range);
  const baseline2012 = useGraphsStore((s) => s.baseline2012);
  const set = useStore().actions;
  const fileRef = useRef<HTMLInputElement>(null);

  const { loaded, series, areas, platforms } = data;
  const bounds = series ? fullRange(series) : null;
  const startYear = series?.startYear ?? 2000;
  const active = range ?? bounds;
  const isGrid = !!loaded && "grid" in loaded;

  // Note when a clamp changed a requested value (e.g. switching to VIIRS
  // while the range starts in 2005).
  const [clamped, setClamped] = useState<string | null>(null);
  const requested = useRef<{ from: number; to: number } | null>(null);
  useEffect(() => {
    if (!bounds || !requested.current || !range) return;
    const req = requested.current;
    requested.current = null;
    if (req.from !== range.from || req.to !== range.to) {
      setClamped(`Adjusted to available data: ${labelOf(startYear, bounds.from)} – ${labelOf(startYear, bounds.to)}.`);
      const id = setTimeout(() => setClamped(null), 4000);
      return () => clearTimeout(id);
    }
  }, [bounds, range, startYear]);

  useEffect(() => {
    if (!loaded) return;
    if (!platforms.includes(platform)) set.setPlatform(platforms[0] ?? "All");
    if (areas.length && (!areaId || !areas.some((a) => a.id === areaId))) set.setArea(areas[0].id);
  }, [loaded, areas, platforms, platform, areaId, set]);

  const kinds: { id: SeriesKind; label: string }[] = [
    { id: "HARMONIZED", label: "Harmonized" },
    { id: "MODIS", label: "MODIS only" },
    { id: "VIIRS", label: "VIIRS only" },
  ];

  const selectRange = (from: number, to: number) => {
    requested.current = { from, to };
    set.setRange({ from: Math.min(from, to), to: Math.max(from, to) }, (i: number) => labelOf(startYear, i));
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-4">
      <div className="flex flex-wrap items-stretch gap-x-6 gap-y-4">
        {/* Left zone: data and region. */}
        <div className="flex min-w-0 max-w-full flex-wrap items-start gap-x-4 gap-y-3">
        <div>
          <Label>Place</Label>
          <PlaceSwitcher
            places={data.places}
            current={data.place}
            csvName={data.csv?.name ?? null}
            csvSelected={data.isCsv}
            onSelect={set.setPlace}
            onUpload={() => fileRef.current?.click()}
          />
        </div>

        <div>
          <Label>Export</Label>
          <ExportMenu data={data} />
        </div>

        {isGrid && (
          <div>
            <Label>Record</Label>
            <div className="seg seg-40" role="group" aria-label="Record">
              {kinds.map((k) => (
                <button
                  key={k.id}
                  className={kind === k.id ? "bg-[#F97316] font-semibold text-[#1A0B00]" : ""}
                  aria-pressed={kind === k.id}
                  onClick={() => set.setKind(k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>
            {kind === "HARMONIZED" && (
              <p className="mt-1.5 flex max-w-64 items-start gap-1.5 text-xs leading-snug text-slate-400">
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                MODIS alone before 2012, then MODIS + VIIRS on the MODIS scale.
              </p>
            )}
            <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={baseline2012} onChange={(e) => set.setBaseline2012(e.target.checked)} className="accent-[#F97316]" />
              Baseline from 2012 only
            </label>
          </div>
        )}

        {!isGrid && areas.length > 0 && (
          <div>
            <Label>Sub-area</Label>
            <select className="field" value={areaId ?? ""} onChange={(e) => set.setArea(e.target.value)}>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        {!isGrid && platforms.length > 0 && (
          <div>
            <Label>Satellite</Label>
            <select className="field" value={platform} onChange={(e) => set.setPlatform(e.target.value)}>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}

        </div>

        {/* Right zone: timeframe, separated by a subtle divider once side by side. */}
        {series && bounds && active && (
          <>
            <div className="hidden w-px self-stretch bg-slate-800 @min-[1100px]/graphs:block" aria-hidden />
            {/* Basis keeps the range on its own line rather than squeezed beside the left zone. */}
            <div className="min-w-0 flex-1 basis-72">
              <DateRange
                startYear={startYear} bounds={bounds} range={active}
                baselineFrom={series.baselineFrom} focusYear={data.focus}
                onRange={(r) => selectRange(r.from, r.to)}
              />
            </div>
          </>
        )}
      </div>

      {isGrid && (
        <div className="mt-4 border-t border-slate-800 pt-4">
          <AreaFilter data={data} />
        </div>
      )}

      {clamped && <p className="mt-1.5 text-xs text-alert">{clamped}</p>}
      {uploadState.info && <p className="mt-1.5 text-xs text-muted">{uploadState.info}</p>}
      {uploadState.error && <p className="mt-1.5 text-xs text-alert">{uploadState.error}</p>}

      <input
        ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" aria-hidden
        onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}
