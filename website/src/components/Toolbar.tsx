import { Check, ChevronDown, Crosshair, Hexagon, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { DrawMode, MapLayer } from "../map/engine";
import type { Place } from "../lib/types";
import { squareAround } from "../lib/geo";

const pop = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};

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

export function PlaceSwitcher({ places, current, onSelect }: { places: Place[]; current: Place | null; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        className="seg !px-3 min-h-[46px] items-center gap-2 text-sm font-semibold"
        aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}
      >
        <span className="h-2 w-2 rounded-full bg-nasa-red" aria-hidden />
        {current?.label ?? "Loading"}
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul {...pop} role="listbox" aria-label="Places"
            className="absolute left-0 top-full z-30 mt-2 w-72 origin-top-left overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-2xl shadow-black/60">
            {places.map((p) => (
              <li key={p.id}>
                <button
                  role="option" aria-selected={p.id === current?.id}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-2"
                  onClick={() => { onSelect(p.id); setOpen(false); }}
                >
                  <span className="mt-0.5 w-4 text-accent">{p.id === current?.id && <Check size={16} aria-hidden />}</span>
                  <span>
                    <span className="block text-sm font-semibold">{p.label}{p.synthetic ? " (synthetic)" : ""}</span>
                    <span className="block text-xs text-muted">{p.summary}</span>
                  </span>
                </button>
              </li>
            ))}
            <li className="px-3 py-2 text-xs text-muted">More countries are added as the data team prepares them.</li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ToolsProps {
  drawMode: DrawMode | null;
  onDrawMode: (mode: DrawMode | null) => void;
  onCoordinates: (polygon: GeoJSON.Polygon, label: string) => void;
}

export function DrawTools({ drawMode, onDrawMode, onCoordinates }: ToolsProps) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const [lat, setLat] = useState("-9.5");
  const [lon, setLon] = useState("-55.5");
  const [radius, setRadius] = useState("150");
  const [error, setError] = useState("");

  const tools: { mode: DrawMode; label: string; icon: React.ReactNode }[] = [
    { mode: "rectangle", label: "Rectangle", icon: <Square size={16} aria-hidden /> },
    { mode: "polygon", label: "Shape", icon: <Hexagon size={16} aria-hidden /> },
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const la = Number(lat), lo = Number(lon), r = Number(radius);
    if (!(la >= -85 && la <= 85)) return setError("Latitude goes from -85 to 85.");
    if (!(lo >= -180 && lo <= 180)) return setError("Longitude goes from -180 to 180.");
    if (!(r >= 10 && r <= 1500)) return setError("Use a distance from 10 to 1,500 km.");
    setError("");
    setOpen(false);
    onCoordinates(squareAround(la, lo, r), `${r} km around ${la.toFixed(2)}, ${lo.toFixed(2)}`);
  }

  return (
    <div ref={ref} className="relative">
      <div className="seg" role="group" aria-label="Choose an area">
        {tools.map((t) => (
          <button key={t.mode} aria-pressed={drawMode === t.mode} onClick={() => onDrawMode(drawMode === t.mode ? null : t.mode)}
            title={`Draw a ${t.label.toLowerCase()} on the map`}>
            {drawMode === t.mode && <motion.span layoutId="tool" className="absolute inset-0 rounded-[9px] bg-accent/25 ring-1 ring-accent" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
            <span className="relative inline-flex items-center gap-1.5">{t.icon}<span className="hidden sm:inline">{t.label}</span></span>
          </button>
        ))}
        <button aria-pressed={open} aria-expanded={open} onClick={() => { onDrawMode(null); setOpen(!open); }} title="Enter coordinates">
          <span className="relative inline-flex items-center gap-1.5"><Crosshair size={16} aria-hidden /><span className="hidden sm:inline">Coordinates</span></span>
        </button>
      </div>
      <AnimatePresence>
        {drawMode && (
          <motion.p {...pop} className="absolute right-0 top-full mt-2 w-60 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted shadow-xl">
            {drawMode === "rectangle" ? "Click two opposite corners on the map." : "Click to add points; click the first point to finish."}
            {" "}Esc cancels.
          </motion.p>
        )}
        {open && (
          <motion.form {...pop} onSubmit={submit}
            className="absolute right-0 top-full z-30 mt-2 grid w-72 origin-top-right gap-3 rounded-xl border border-border bg-surface p-4 shadow-2xl shadow-black/60">
            <p className="text-sm font-semibold">Area around a point</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-muted">Latitude
                <input className="field num" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
              </label>
              <label className="grid gap-1 text-xs text-muted">Longitude
                <input className="field num" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />
              </label>
            </div>
            <label className="grid gap-1 text-xs text-muted">Distance from the point (km)
              <input className="field num" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} />
            </label>
            {error && <p className="text-xs text-[#ff9d8f]" role="alert">{error}</p>}
            <button className="btn btn-primary" type="submit">Show this area</button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LayerSwitch({ layer, onLayer, historyAvailable }: { layer: MapLayer; onLayer: (l: MapLayer) => void; historyAvailable: boolean }) {
  const options: { id: MapLayer; label: string }[] = [
    { id: "history", label: "History" },
    { id: "recent", label: "Last 7 days" },
  ];
  return (
    <div className="seg" role="group" aria-label="Map layer">
      {options.map((o) => (
        <button key={o.id} aria-pressed={layer === o.id} onClick={() => onLayer(o.id)}
          disabled={o.id === "history" && !historyAvailable}
          className="disabled:cursor-not-allowed disabled:opacity-40">
          {layer === o.id && <motion.span layoutId="layer" className="absolute inset-0 rounded-[9px] bg-surface-2 ring-1 ring-border" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
