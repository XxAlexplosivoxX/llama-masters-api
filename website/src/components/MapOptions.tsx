import { Layers, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { DEFAULT_MAP_OPTIONS, type MapOptions as Options } from "../hooks/useMapOptions";

export function MapOptions({ options, onChange, online, onOpen }: {
  options: Options; onChange: React.Dispatch<React.SetStateAction<Options>>; online: boolean | null; onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const ref = useDismiss(open, close);
  useEffect(() => {
    if (!open) return;
    onOpen?.();
    panel.current?.focus({ preventScroll: true });
  }, [open]);
  const set = <K extends keyof Options>(key: K, value: Options[K]) => onChange((current) => ({ ...current, [key]: value }));
  const segment = <K extends "basemap" | "projection">(key: K, label: string, values: { value: Options[K]; label: string }[]) => (
    <div className="grid gap-1.5">
      <p id={`${id}-${key}`} className="text-sm">{label}</p>
      <div className="seg map-options-seg" role="group" aria-labelledby={`${id}-${key}`}>
        {values.map((item) => (
          <button key={item.value} aria-pressed={options[key] === item.value}
            disabled={key === "basemap" && item.value !== "dark" && online !== true}
            onClick={() => set(key, item.value)}>{item.label}</button>
        ))}
      </div>
    </div>
  );
  const toggle = (key: "labels" | "borders", label: string) => (
    <label className="flex min-h-9 items-center justify-between gap-3 text-sm">
      {label}
      <input type="checkbox" role="switch" checked={options[key]} onChange={(e) => set(key, e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-accent" />
    </label>
  );

  return (
    <div ref={ref} className="relative">
      <div className="seg">
        <button ref={trigger} aria-label="Map options" title="Map options" aria-haspopup="dialog"
          aria-expanded={open} aria-controls={open ? id : undefined} aria-pressed={open} onClick={() => open ? close() : setOpen(true)}>
          <Layers size={16} aria-hidden />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div ref={panel} id={id} role="dialog" aria-labelledby={`${id}-title`} tabIndex={-1}
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-30 mt-2 grid w-[19.5rem] origin-top-right gap-3 rounded-xl border border-border bg-surface p-4 shadow-2xl shadow-black/60 max-h-[calc(100dvh-10rem)] overflow-y-auto max-sm:fixed max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-[184px] max-sm:z-50 max-sm:w-auto max-sm:mt-0 max-sm:max-h-[calc(100dvh-7.25rem-184px)]">
            <div className="flex items-center justify-between gap-2">
              <p id={`${id}-title`} className="text-sm font-semibold">Map options</p>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                aria-label="Close map options" onClick={close}><X size={16} aria-hidden /></button>
            </div>
            {segment("basemap", "Basemap", [
              { value: "dark", label: "Dark" }, { value: "satellite", label: "Satellite" }, { value: "night", label: "Night lights" },
            ])}
            <p className="text-2xs leading-snug text-muted">Satellite: NASA Blue Marble composite. Night lights: VIIRS 2016. Not live imagery.</p>
            {online === false && <p className="text-xs text-muted">Imagery needs a connection</p>}
            {toggle("labels", "Place names")}
            {toggle("borders", "Borders")}
            <label className="grid gap-2 text-sm">
              <span className="flex justify-between gap-2">Hotspot grid opacity <span className="num text-muted">{Math.round(options.gridOpacity * 100)}%</span></span>
              <input className="timeline w-full" type="range" min={30} max={100} step={1}
                aria-label="Hotspot grid opacity" aria-valuetext={`${Math.round(options.gridOpacity * 100)}%`}
                value={Math.round(options.gridOpacity * 100)} onChange={(e) => set("gridOpacity", Number(e.target.value) / 100)} />
            </label>
            {segment("projection", "Projection", [{ value: "globe", label: "Globe" }, { value: "mercator", label: "Flat" }])}
            <button className="link justify-self-start text-xs" onClick={() => onChange({ ...DEFAULT_MAP_OPTIONS })}>Reset</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
