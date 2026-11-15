import { Check, ChevronDown, Crosshair, Hexagon, Shapes, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import type { DrawMode, MapLayer } from "../map/engine";
import type { BBox, Place } from "../lib/types";
import { areaKm2, bboxOf, bboxPolygon, squareAround } from "../lib/geo";
import { fmt, fmtKm2 } from "../lib/format";
import { CONTINENTS, continentOf, type Continent } from "../lib/continents";
import { describeBBox, fmtPoint, overlaps, parseDegrees, parseNumber, type Parsed } from "../lib/validate";

const pop = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};

export function PlaceSwitcher({
  places,
  current,
  onSelect,
  onOpen,
}: {
  places: Place[];
  current: Place | null;
  onSelect: (id: string) => void;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [continent, setContinent] = useState<Continent | "All">("All");
  const ref = useDismiss(open, () => setOpen(false));
  useEffect(() => {
    if (open) {
      onOpen?.();
      setQuery("");
      setContinent(current ? continentOf(current.id) : "All");
    }
  }, [open]);
  const pick = (id: string) => {
    onSelect(id);
    setOpen(false);
  };
  const needle = fold(query.trim());
  // A search looks in every continent; otherwise the list shows the chosen continent (or all, grouped).
  const shown = needle
    ? places.filter((p) => fold(p.label).includes(needle) || p.iso.some((i) => i.toLowerCase() === needle))
    : continent === "All"
      ? places
      : places.filter((p) => continentOf(p.id) === continent);
  const groups = CONTINENTS.map((c) => ({ continent: c, places: shown.filter((p) => continentOf(p.id) === c) })).filter(
    (g) => g.places.length,
  );
  const available = CONTINENTS.filter((c) => places.some((p) => continentOf(p.id) === c));

  return (
    <div ref={ref} className="relative">
      <button
        data-tour="place"
        className="seg !px-3 min-h-[46px] items-center gap-2 text-sm font-semibold"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="h-2 w-2 rounded-full bg-nasa-red" aria-hidden />
        {current?.label ?? "Loading"}
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            {...pop}
            className="absolute left-0 top-full z-30 mt-2 flex max-h-[min(34rem,calc(100dvh-6rem))] w-[22rem] origin-top-left flex-col rounded-xl border border-border bg-surface p-1 shadow-2xl shadow-black/60 max-sm:left-auto max-sm:right-0 max-sm:h-80 max-sm:w-64 max-sm:origin-top-right"
          >
            <input
              autoFocus
              className="field m-1.5 w-auto"
              type="search"
              placeholder={`Search ${places.length} countries`}
              value={query}
              aria-label="Search countries"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && shown.length) pick(shown[0].id);
              }}
            />
            {!needle && (
              <div className="flex flex-wrap gap-1 px-1.5 pb-1.5" role="group" aria-label="Continent">
                {(["All", ...available] as const).map((c) => (
                  <button
                    key={c}
                    aria-pressed={continent === c}
                    onClick={() => setContinent(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      continent === c
                        ? "border-accent bg-accent/15 text-text"
                        : "border-border text-muted hover:border-muted hover:text-text"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div role="listbox" aria-label="Countries" className="min-h-0 overflow-y-auto overscroll-contain pb-1">
              {groups.map((g) => (
                <div key={g.continent} role="group" aria-label={g.continent}>
                  {(groups.length > 1 || needle) && (
                    <p className="sticky top-0 z-10 bg-surface/95 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted backdrop-blur">
                      {g.continent}
                      <span className="num ms-1.5 font-normal normal-case tracking-normal">{g.places.length}</span>
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-0.5 max-sm:grid-cols-1">
                    {g.places.map((p) => (
                      <button
                        key={p.id}
                        role="option"
                        aria-selected={p.id === current?.id}
                        onClick={() => pick(p.id)}
                        className={`flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-2 ${
                          p.id === current?.id ? "bg-surface-2 text-text" : ""
                        }`}
                        title={p.label}
                      >
                        <span className="w-4 shrink-0 text-accent">
                          {p.id === current?.id && <Check size={15} aria-hidden />}
                        </span>
                        <span className="truncate">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!shown.length && <p className="px-3 py-2.5 text-xs text-muted">No country matches "{query}".</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Lowercase without accents, so "cote" finds "Côte d'Ivoire". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

interface ToolsProps {
  drawMode: DrawMode | null;
  onDrawMode: (mode: DrawMode | null) => void;
  onCoordinates: (polygon: GeoJSON.Polygon, label: string) => void;
  bounds: BBox | null;
  placeLabel: string;
  onOpen?: () => void; // a tool or the form opened (mobile collapses the sheet so the map shows)
}

export function DrawTools({ drawMode, onDrawMode, onCoordinates, bounds, placeLabel, onOpen }: ToolsProps) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useDismiss(open || menu, () => {
    setOpen(false);
    setMenu(false);
  });
  // One tool at a time: starting to draw closes the coordinates form, opening the form stops drawing.
  useEffect(() => {
    if (drawMode) {
      setOpen(false);
      setMenu(false);
    }
  }, [drawMode]);
  useEffect(() => {
    if (open || drawMode) onOpen?.();
  }, [open, drawMode]);

  const tools: { mode: DrawMode; label: string; icon: React.ReactNode }[] = [
    { mode: "rectangle", label: "Rectangle", icon: <Square size={16} aria-hidden /> },
    { mode: "polygon", label: "Shape", icon: <Hexagon size={16} aria-hidden /> },
  ];
  const highlight = (
    <motion.span
      layoutId="tool"
      className="absolute inset-0 rounded-[9px] bg-accent/25 ring-1 ring-accent"
      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
    />
  );

  return (
    <div ref={ref} className="relative">
      {/* One button that opens the area tools. */}
      <div className="seg">
        <button
          aria-pressed={!!drawMode || open}
          aria-expanded={menu}
          aria-haspopup="menu"
          aria-label="Choose an area"
          title="Choose an area"
          className="justify-center max-sm:w-10 max-sm:!px-0"
          onClick={() => setMenu(!menu)}
        >
          {(!!drawMode || open) && highlight}
          <span className="relative inline-flex items-center gap-0.5">
            {drawMode ? (
              tools.find((t) => t.mode === drawMode)!.icon
            ) : open ? (
              <Crosshair size={16} aria-hidden />
            ) : (
              <Shapes size={16} aria-hidden />
            )}
            <span className="ms-1 max-sm:hidden">
              {drawMode ? tools.find((t) => t.mode === drawMode)!.label : open ? "Coordinates" : "Select area"}
            </span>
            <ChevronDown size={12} aria-hidden />
          </span>
        </button>
      </div>
      <AnimatePresence>
        {menu && (
          <motion.div
            {...pop}
            role="menu"
            aria-label="Choose an area"
            className="absolute left-0 top-full z-30 mt-2 w-48 origin-top-left rounded-xl border border-border bg-surface p-1 shadow-2xl shadow-black/60"
          >
            {tools.map((t) => (
              <button
                key={t.mode}
                role="menuitemradio"
                aria-checked={drawMode === t.mode}
                onClick={() => {
                  setMenu(false);
                  setOpen(false);
                  onDrawMode(drawMode === t.mode ? null : t.mode);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2"
              >
                {t.icon}
                {t.label}
                <span className="ml-auto text-accent">{drawMode === t.mode && <Check size={15} aria-hidden />}</span>
              </button>
            ))}
            <button
              role="menuitemradio"
              aria-checked={open}
              onClick={() => {
                setMenu(false);
                onDrawMode(null);
                setOpen(!open);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2"
            >
              <Crosshair size={16} aria-hidden />
              Coordinates
              <span className="ml-auto text-accent">{open && <Check size={15} aria-hidden />}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {drawMode && !open && (
          <motion.p
            key="hint"
            {...pop}
            role="status"
            className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.75rem] max-sm:z-50 max-sm:w-auto max-sm:mt-0"
          >
            {drawMode === "rectangle"
              ? "Click two opposite corners on the map."
              : "Click to add points; click the first point to finish. Lines cannot cross."}{" "}
            Esc cancels.
          </motion.p>
        )}
        {open && (
          <CoordinateForm
            key="form"
            bounds={bounds}
            placeLabel={placeLabel}
            onSubmit={(polygon, label) => {
              setOpen(false);
              onCoordinates(polygon, label);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

type Tab = "point" | "box";
type Key = "lat" | "lon" | "km" | "north" | "south" | "west" | "east";
const PARSE: Record<Key, (raw: string) => Parsed> = {
  lat: (v) => parseDegrees(v, "lat"),
  lon: (v) => parseDegrees(v, "lon"),
  km: (v) => parseNumber(v, { min: 10, max: 1500, unit: "km" }),
  north: (v) => parseDegrees(v, "lat"),
  south: (v) => parseDegrees(v, "lat"),
  west: (v) => parseDegrees(v, "lon"),
  east: (v) => parseDegrees(v, "lon"),
};
const TAB_KEYS: Record<Tab, Key[]> = { point: ["lat", "lon", "km"], box: ["north", "west", "east", "south"] };
const LABEL: Record<Key, string> = {
  lat: "Latitude",
  lon: "Longitude",
  km: "Distance from the point (km)",
  north: "North",
  south: "South",
  west: "West",
  east: "East",
};
const round = (v: number) => String(Math.round(v * 10) / 10);

function CoordinateForm({
  bounds,
  placeLabel,
  onSubmit,
}: {
  bounds: BBox | null;
  placeLabel: string;
  onSubmit: (polygon: GeoJSON.Polygon, label: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("point");
  const [values, setValues] = useState<Record<Key, string>>(() => {
    const [w, s, e, n] = bounds ?? [-74, -34, -34.5, 5.5];
    const lat = bounds ? (s + n) / 2 : -9.5,
      lon = bounds ? (w + e) / 2 : -55.5;
    return {
      lat: round(lat),
      lon: round(lon),
      km: "150",
      north: round(lat + 2),
      south: round(lat - 2),
      west: round(lon - 2),
      east: round(lon + 2),
    };
  });
  const [touched, setTouched] = useState<Set<Key>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const keys = TAB_KEYS[tab];
  const parsed = Object.fromEntries(keys.map((k) => [k, PARSE[k](values[k])])) as Record<Key, Parsed>;
  const fieldsOk = keys.every((k) => parsed[k].value !== undefined);
  const v = (k: Key) => parsed[k].value!;

  // Cross-field checks run only once every field parses.
  let polygon: GeoJSON.Polygon | null = null;
  let problem = "";
  if (fieldsOk) {
    if (tab === "point") polygon = squareAround(v("lat"), v("lon"), v("km"));
    else if (v("south") >= v("north")) problem = "North must be above South.";
    else if (v("west") >= v("east")) problem = "East must be greater than West (boxes cannot cross the 180° line).";
    else if (v("north") - v("south") < 0.1 || v("east") - v("west") < 0.1)
      problem = "Make the box at least 0.1° (about 11 km) on each side.";
    else polygon = bboxPolygon([v("west"), v("south"), v("east"), v("north")]);
    if (polygon && bounds && !overlaps(bboxOf(polygon), bounds)) {
      problem = `This area is outside ${placeLabel}. Data covers ${describeBBox(bounds)}.`;
      polygon = null;
    }
  }

  const show = (k: Key) => (submitted || touched.has(k)) && parsed[k].error;
  const set = (k: Key, value: string) => setValues((old) => ({ ...old, [k]: value }));
  const blur = (k: Key) => setTouched((old) => new Set(old).add(k));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!polygon) {
      const bad = keys.find((k) => parsed[k].error);
      form.current?.querySelector<HTMLInputElement>(`[name="${bad ?? keys[0]}"]`)?.focus();
      return;
    }
    const label =
      tab === "point"
        ? `${fmt(v("km"))} km around ${fmtPoint(v("lat"), v("lon"))}`
        : `Box ${fmtPoint(v("north"), v("west"))} to ${fmtPoint(v("south"), v("east"))}`;
    onSubmit(polygon, label);
  }

  const field = (k: Key, extra?: React.ReactNode) => (
    <label key={k} className="grid gap-1 text-xs text-muted">
      {LABEL[k]}
      <input
        name={k}
        className="field num"
        inputMode={k === "km" ? "numeric" : "text"}
        autoComplete="off"
        spellCheck={false}
        value={values[k]}
        onChange={(e) => set(k, e.target.value)}
        onBlur={() => blur(k)}
        aria-invalid={!!show(k)}
        aria-describedby={show(k) ? `${k}-error` : undefined}
      />
      {extra}
      {show(k) && (
        <span id={`${k}-error`} className="text-2xs leading-snug text-[#FF9D8F]">
          {parsed[k].error}
        </span>
      )}
    </label>
  );

  const chip = (km: number) => (
    <button
      key={km}
      type="button"
      onClick={() => set("km", String(km))}
      className={`num rounded-md border px-2 py-0.5 text-2xs ${values.km === String(km) ? "border-accent text-text" : "border-border hover:text-text"}`}
    >
      {km} km
    </button>
  );

  return (
    <motion.form
      {...pop}
      ref={form}
      onSubmit={submit}
      noValidate
      className="absolute right-0 top-full z-30 mt-2 grid w-[19.5rem] origin-top-right gap-3 rounded-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.75rem] max-sm:z-50 max-sm:w-auto max-sm:mt-0 max-sm:max-h-[calc(100dvh-4.75rem-184px)] max-sm:overflow-y-auto border border-border bg-surface p-4 shadow-2xl shadow-black/60"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Area by coordinates</p>
        <div className="seg !p-0.5" role="tablist" aria-label="Kind of area">
          {(["point", "box"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === tab}
              aria-pressed={t === tab}
              className="!min-h-8 !px-2.5 !text-xs"
              onClick={() => {
                setTab(t);
                setSubmitted(false);
              }}
            >
              {t === tab && (
                <motion.span
                  layoutId="coord-tab"
                  className="absolute inset-0 rounded-[9px] bg-surface-2 ring-1 ring-border"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                />
              )}
              <span className="relative">{t === "point" ? "Point" : "Box"}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === "point" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {field("lat")}
            {field("lon")}
          </div>
          {field("km", <span className="flex gap-1.5">{[50, 150, 500].map(chip)}</span>)}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 mx-auto w-1/2">{field("north")}</div>
          {field("west")}
          {field("east")}
          <div className="col-span-2 mx-auto w-1/2">{field("south")}</div>
        </div>
      )}
      <p className="text-2xs leading-snug text-muted">
        Decimal degrees, like <span className="num">-9.5</span> or <span className="num">9.5 S</span>. South and west
        are negative.
      </p>
      {(submitted || touched.size > 0) && problem && (
        <p className="text-xs text-[#FF9D8F]" role="alert">
          {problem}
        </p>
      )}
      {polygon && (
        <p className="num text-xs text-muted" aria-live="polite">
          About {fmtKm2(areaKm2(polygon))}
        </p>
      )}
      <button className="btn btn-primary" type="submit">
        Show this area
      </button>
    </motion.form>
  );
}

/** The current selection, shown under the tools so it is clear what the panel describes and how to undo it. */
export function SelectionChip({
  label,
  placeLabel,
  hidden,
  onClear,
}: {
  label: string | null;
  placeLabel: string;
  hidden: boolean;
  onClear: () => void;
}) {
  return (
    <AnimatePresence>
      {label && !hidden && (
        <motion.div
          {...pop}
          key="selection"
          className="flex max-w-[22rem] items-center gap-2 rounded-xl border border-accent/50 bg-bg/85 py-1 pl-3 pr-1 text-sm backdrop-blur-md"
        >
          <span className="h-2 w-2 shrink-0 rounded-[2px] border border-accent bg-accent/30" aria-hidden />
          <span className="min-w-0 truncate num" title={label}>
            {label}
          </span>
          <button
            onClick={onClear}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-accent hover:bg-accent/15"
            title={`Back to all of ${placeLabel}`}
          >
            <X size={14} aria-hidden /> Clear
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function LayerSwitch({
  layer,
  onLayer,
  historyAvailable,
}: {
  layer: MapLayer;
  onLayer: (l: MapLayer) => void;
  historyAvailable: boolean;
}) {
  const options: { id: MapLayer; label: string; short: string }[] = [
    { id: "history", label: "History", short: "History" },
    { id: "recent", label: "Last 7 days", short: "7 days" },
  ];
  return (
    <div className="seg" data-tour="layers" role="group" aria-label="Map layer">
      {options.map((o) => (
        <button
          key={o.id}
          aria-pressed={layer === o.id}
          onClick={() => onLayer(o.id)}
          aria-label={o.label}
          disabled={o.id === "history" && !historyAvailable}
          className="max-sm:px-2.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {layer === o.id && (
            <motion.span
              layoutId="layer"
              className="absolute inset-0 rounded-[9px] bg-surface-2 ring-1 ring-border"
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span className="relative">
            <span className="sm:hidden">{o.short}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
