import { Check, ChevronDown, Flame, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COMING_SOON } from "../lib/shared";
import type { Place } from "../types";

interface Props {
  places: Place[];
  current: Place | null;
  csvName: string | null;
  csvSelected: boolean;
  onSelect: (id: string) => void;
  onUpload: () => void;
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return ref;
}

/** Grouped place list like the website's: region, countries, weekly exports, coming soon, CSV upload. */
export function PlaceSwitcher({ places, current, csvName, csvSelected, onSelect, onUpload }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const grids = places.filter((p) => p.kind === "grid");
  const region = grids.filter((p) => p.scope === "region");
  const countries = grids.filter((p) => p.scope !== "region").sort((a) => (a.id === "brazil" ? -1 : 1));
  const weekly = places.filter((p) => p.kind === "weekly");
  const isCsv = csvSelected;

  const item = (p: Place) => (
    <li key={p.id}>
      <button role="option" aria-selected={p.id === current?.id}
        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg"
        onClick={() => { onSelect(p.id); setOpen(false); }}>
        <span className="mt-0.5 w-4 text-firefly-3">{p.id === current?.id && <Check size={16} aria-hidden />}</span>
        <span>
          <span className="block text-sm font-semibold">{p.label}{p.synthetic ? " (synthetic)" : ""}</span>
          <span className="block text-xs text-muted">{p.summary}</span>
        </span>
      </button>
    </li>
  );

  const heading = (text: string) => (
    <li className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted">{text}</li>
  );

  return (
    <div ref={ref} className="relative">
      <button
        className="seg seg-40 !px-3 items-center gap-2 text-sm font-semibold"
        aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}
      >
        <Flame size={14} className="text-firefly-3" aria-hidden />
        {current?.label ?? (csvName ? `Uploaded: ${csvName}` : "Loading")}
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul role="listbox" aria-label="Places"
          className="absolute left-0 top-full z-30 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-grid bg-card p-1 shadow-2xl shadow-black/60">
          {csvName && (
            <>
              <li>
                <button role="option" aria-selected={isCsv}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg"
                  onClick={() => { onSelect("csv:upload"); setOpen(false); }}>
                  <span className="mt-0.5 w-4 text-firefly-3">{isCsv && <Check size={16} aria-hidden />}</span>
                  <span>
                    <span className="block text-sm font-semibold">Uploaded: {csvName}</span>
                    <span className="block text-xs text-muted">FIRMS file, exact monthly counts</span>
                  </span>
                </button>
              </li>
            </>
          )}
          {region.length > 0 && heading("Region")}
          {region.map(item)}
          {countries.length > 0 && heading("Countries")}
          {countries.map(item)}
          {weekly.length > 0 && heading("Weekly research exports")}
          {weekly.map(item)}
          {COMING_SOON.length > 0 && (
            <li className="px-3 py-2 text-xs text-muted">
              Coming soon: {COMING_SOON.map((c) => c.label).join(", ")}.
            </li>
          )}
          <li className="border-t border-grid">
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-bg"
              onClick={() => { setOpen(false); onUpload(); }}>
              <span className="w-4 text-muted"><Upload size={15} aria-hidden /></span>
              Upload FIRMS CSV…
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
