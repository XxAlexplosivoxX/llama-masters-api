import { useEffect, useMemo, useRef, useState } from "react";
import type { Explorer } from "../state";
import { AnimatePresence } from "motion/react";
import { labelOf } from "../lib/series";
import { MapEngine, type DrawMode, type MapLayer, type Padding } from "./engine";
import { LoadingCard, MapCaption, stepsFrom } from "./MapStatus";


interface Props {
  explorer: Explorer;
  layer: MapLayer;
  drawMode: DrawMode | null;
  padding: Padding;
  onDrawn: (polygon: GeoJSON.Polygon) => void;
  onIntroDone: () => void;
  onGridScale: (max: number) => void;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 1;
}

export function MapView({ explorer, layer, drawMode, padding, onDrawn, onIntroDone, onGridScale }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [failure, setFailure] = useState("");
  const introPlayed = useRef(false);
  const onDrawnRef = useRef(onDrawn);
  onDrawnRef.current = onDrawn;
  const { loaded, range, hoverMonth, shape, placeBBox, values, kind, cells: selected, recent, status, place, series } = explorer;
  const [intro, setIntro] = useState<{ k: number; minutes: number } | null>(null);
  const [afterIntro, setAfterIntro] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let created: MapEngine | null = null;
    MapEngine.create(container.current!, (polygon) => onDrawnRef.current(polygon), controller.signal)
      .then((e) => { created = e; setEngine(e); })
      .catch((error) => { if (error.name !== "AbortError") setFailure(String(error.message ?? error)); });
    return () => {
      created?.destroy();
      controller.abort();
      setEngine(null);
    };
  }, []);

  useEffect(() => {
    if (!engine) return;
    const observer = new ResizeObserver(() => engine.resize());
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, [engine]);

  // Grid values: the hovered calendar month, otherwise the total over the selected range.
  // With a selection, only its cells are drawn, and the colour scale adapts to them.
  const gridData = loaded && "grid" in loaded ? loaded.grid : null;
  const shown = useMemo(
    () => (gridData ? (shape ? selected : gridData.cells.map((_, i) => i)) : []),
    [gridData, shape, selected],
  );
  const from = range?.from ?? 0, to = range?.to ?? -1;
  const counts = values?.[kind] ?? null;

  // Totals over the selected dates, and one fixed scale for single months, so that
  // hovering or playing month after month compares like with like.
  const scale = useMemo(() => {
    if (!counts) return null;
    const totals = shown.map((i) => { let s = 0; for (let m = from; m <= to; m++) s += counts[i][m]; return s; });
    const stride = Math.max(1, Math.floor((shown.length * (to - from + 1)) / 150_000));
    const monthly: number[] = [];
    let k = 0;
    for (const i of shown) for (let m = from; m <= to; m++) if (k++ % stride === 0 && counts[i][m] > 0) monthly.push(counts[i][m]);
    return { totals, totalMax: percentile(totals.filter((v) => v > 0), 0.98), monthMax: percentile(monthly, 0.98) };
  }, [counts, shown, from, to]);

  useEffect(() => {
    if (!engine || !gridData) return;
    engine.setGridCells({ cellDeg: gridData.cell_deg, cells: shown.map((i) => ({ west: gridData.cells[i][0], south: gridData.cells[i][1] })) });
  }, [engine, gridData, shown]);

  useEffect(() => {
    if (!engine || !scale || !counts) return;
    const month = hoverMonth !== null && hoverMonth >= from && hoverMonth <= to ? hoverMonth : null;
    const frame = month === null ? scale.totals : shown.map((i) => series?.values[month] == null ? 0 : counts[i][month] ?? 0);
    const max = month === null ? scale.totalMax : scale.monthMax;
    engine.setGridValues(frame, max);
    onGridScale(max);
  }, [engine, scale, hoverMonth, series]);

  // Any exploring (hover, playback) ends the opening animation at once.
  useEffect(() => {
    if (engine && hoverMonth !== null) engine.skipIntro();
  }, [engine, hoverMonth]);

  useEffect(() => {
    if (engine) engine.setRecent(recent);
  }, [engine, recent]);

  useEffect(() => {
    if (engine) engine.setAreas(loaded && "areas" in loaded ? loaded.areas : null);
  }, [engine, loaded]);

  useEffect(() => {
    if (engine) engine.setSelection(shape?.polygon ?? null);
  }, [engine, shape]);

  useEffect(() => {
    if (engine && introPlayed.current) engine.setLayer(layer);
  }, [engine, layer]);

  useEffect(() => {
    if (!engine) return;
    if (drawMode) engine.startDrawing(drawMode);
    else engine.stopDrawing();
  }, [engine, drawMode]);

  // First data: play the opening sequence once; later place changes just fly.
  useEffect(() => {
    if (!engine || !loaded || !placeBBox) return;
    if (!introPlayed.current) {
      introPlayed.current = true;
      setIntro({ k: 0, minutes: -1 });
      // The intro ends on the engine's current layer; `layer` here would be the value from when it started.
      engine.intro(placeBBox, padding, (k, minutes) => setIntro({ k, minutes })).then(() => {
        setIntro(null);
        setAfterIntro(true);
        setTimeout(() => setAfterIntro(false), 4500);
        onIntroDone();
      });
    } else if (!shape) {
      engine.fit(placeBBox, padding);
    }
  }, [engine, loaded, placeBBox]);

  useEffect(() => {
    if (!engine || !shape) return;
    const ring = shape.polygon.coordinates[0];
    const xs = ring.map((c) => c[0]);
    const ys = ring.map((c) => c[1]);
    const room = { top: padding.top + 60, right: padding.right + 80, bottom: padding.bottom + 60, left: padding.left + 80 };
    engine.fit([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], room, 1100);
  }, [engine, shape]);

  // What the map is doing, in words: first load, the opening animation, then any later reload.
  const firstLoad = !failure && (!engine || (status.kind === "loading" && !introPlayed.current));
  let caption: string | null = null;
  if (intro && series && range) {
    caption = intro.minutes < 0
      ? "Drawing the monthly history"
      : `Monthly history ${labelOf(series.startYear, range.from)} to ${labelOf(series.startYear, range.to)}`;
  } else if (afterIntro && series && range && layer === "history" && hoverMonth === null) {
    caption = `Monthly history ${labelOf(series.startYear, range.from)} to ${labelOf(series.startYear, range.to)}: brighter cells had more fire`;
  } else if (status.kind === "loading" && introPlayed.current) {
    const p = status.progress?.[0];
    caption = `${status.message}${p && p.loaded ? `: ${(p.loaded / 1e6).toFixed(1)}${p.total ? ` of ${(p.total / 1e6).toFixed(1)}` : ""} MB` : ""}`;
  }

  return (
    <div className="absolute inset-0">
      <div
        ref={container}
        className={`h-full w-full bg-bg transition-opacity duration-700 ${engine ? "opacity-100" : "opacity-0"}`}
        aria-label="Map of fire hotspots" role="region"
      />
      <AnimatePresence>
        {firstLoad && (
          <div key="loading" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ top: `calc(${padding.top}px + (100% - ${padding.top + padding.bottom}px) / 2)` }}>
            <LoadingCard title={place ? `Loading ${place.label}` : "Loading"} steps={stepsFrom(!!engine, !!loaded, status.kind === "loading" ? status.progress : undefined, place?.label ?? "")} />
          </div>
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2" style={padding.bottom > 200
          ? { bottom: padding.bottom + 12, maxWidth: "calc(100% - 24px)" }
          : { top: Math.max(68, padding.top - 52), maxWidth: "calc(100% - 24px)" }}>
        <MapCaption text={caption} progress={intro?.k} />
      </div>
      {failure && (
        <p className="absolute inset-x-4 top-24 rounded-lg border border-border bg-surface p-3 text-sm text-muted">
          The map could not start ({failure}). The calendar and charts still work.
        </p>
      )}
      {engine && !engine.online && (
        <p className="absolute left-4 top-24 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
          Basemap offline: showing data without streets and borders.
        </p>
      )}
    </div>
  );
}
