import { motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Drawer } from "vaul";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Legend } from "./components/Legend";
import { Panel } from "./components/Panel";
import { DrawTools, LayerSwitch, PlaceSwitcher, SelectionChip } from "./components/Toolbar";
import type { DrawMode, MapLayer, Padding } from "./map/engine";
import { MapView } from "./map/MapView";
import { shapeFromDrawing, useExplorer } from "./state";

const DESKTOP = "(min-width: 1024px)";
const SNAPS = ["168px", 0.55, 1] as const;

function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
  );
}

export function App() {
  const explorer = useExplorer();
  const desktop = useMedia(DESKTOP);
  const [layer, setLayer] = useState<MapLayer>("history");
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const [gridMax, setGridMax] = useState(0);
  const [snap, setSnap] = useState<number | string | null>(SNAPS[1]);

  const historyAvailable = !!explorer.loaded && "grid" in explorer.loaded;
  useEffect(() => {
    if (explorer.loaded && !historyAvailable) setLayer("recent");
    if (historyAvailable) setLayer("history");
  }, [explorer.loaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawMode(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const padding: Padding = desktop
    ? { top: 96, right: 48, bottom: 48, left: 48 }
    : { top: 128, right: 24, bottom: Math.round(window.innerHeight * 0.56), left: 24 };

  const chooseArea = (polygon: GeoJSON.Polygon, label?: string) => {
    setDrawMode(null);
    const shape = shapeFromDrawing(polygon, "Drawn area");
    explorer.setShape(label ? { ...shape, label } : shape);
    if (!desktop) setSnap(SNAPS[1]);
  };

  const overlay = (
    <motion.div
      initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-3 lg:p-4 [&>*]:pointer-events-auto"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      <PlaceSwitcher places={explorer.places} current={explorer.place} onSelect={explorer.selectPlace} />
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          <DrawTools drawMode={drawMode} onDrawMode={setDrawMode} onCoordinates={chooseArea}
            bounds={explorer.place?.bbox ?? null} placeLabel={explorer.place?.label ?? "this place"} />
          <LayerSwitch layer={layer} onLayer={setLayer} historyAvailable={historyAvailable} />
        </div>
        <SelectionChip label={explorer.shape?.label ?? null} placeLabel={explorer.place?.label ?? ""}
          hidden={!!drawMode} onClear={() => explorer.setShape(null)} />
      </div>
    </motion.div>
  );

  const map = (
    <ErrorBoundary label="map">
      <MapView
        explorer={explorer} layer={layer} drawMode={drawMode} padding={padding}
        onDrawn={(polygon) => chooseArea(polygon)} onIntroDone={() => setIntroDone(true)} onGridScale={setGridMax}
      />
    </ErrorBoundary>
  );
  const panel = (
    <ErrorBoundary label="panel">
      <Panel explorer={explorer} showingRecent={layer === "recent"} onShowRecent={() => setLayer("recent")} />
    </ErrorBoundary>
  );

  // On mobile the open drawer carries its own legend, so the map one only shows above the collapsed sheet.
  const legendVisible = introDone && (desktop || snap === SNAPS[0]);
  const legend = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: legendVisible ? 1 : 0, y: legendVisible ? 0 : 8 }} transition={{ duration: 0.4 }}
      className={desktop ? "absolute bottom-4 left-4 z-10" : "pointer-events-none absolute bottom-[180px] left-3 z-10"}
    >
      <Legend explorer={explorer} layer={layer} gridMax={gridMax} />
    </motion.div>
  );

  if (desktop) {
    return (
      <div className="flex h-full overflow-hidden">
        <main className="relative flex-1 overflow-hidden">
          {map}
          {overlay}
          {legend}
        </main>
        <motion.aside
          initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-[440px] shrink-0 overflow-y-auto border-l border-border bg-surface"
        >
          <Brand />
          {panel}
        </motion.aside>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      {map}
      {overlay}
      {legend}
      <Drawer.Root
        open modal={false} dismissible={false}
        snapPoints={[...SNAPS]} activeSnapPoint={snap} setActiveSnapPoint={setSnap}
      >
        <Drawer.Portal>
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-40 flex h-full max-h-[96%] flex-col rounded-t-2xl border-t border-border bg-surface outline-none"
            aria-describedby={undefined}
          >
            <div className="flex justify-center py-2.5" aria-hidden>
              <div className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <Drawer.Title className="sr-only">Fire calendar for the selected area</Drawer.Title>
            <div className={`flex-1 ${snap === 1 ? "overflow-y-auto" : "overflow-hidden"}`}>
              {panel}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
      <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="10.5" fill="none" stroke="#4C8DFF" strokeWidth="1.5" />
          <path d="M12 5.5c1.8 2.6 4.2 4.6 4.2 7.6a4.2 4.2 0 0 1-8.4 0c0-1.5.7-2.6 1.6-3.6.2 1.3.9 2.2 1.8 2.4-.4-2.3.1-4.4.8-6.4Z" fill="#FC3D21" />
        </svg>
        <span className="text-sm font-semibold">Fire calendar</span>
      </div>
      <a className="text-xs text-muted hover:text-text" href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">
        Data: NASA FIRMS
      </a>
    </div>
  );
}
