import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Drawer } from "vaul";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Legend } from "./components/Legend";
import { PlayButton, Timeline } from "./components/Timeline";
import { Panel } from "./components/Panel";
import { Summary } from "./components/Summary";
// Area selection (DrawTools, SelectionChip) is switched off for now: the site works by country.
import { LayerSwitch, PlaceSwitcher } from "./components/Toolbar";
import type { DrawMode, MapLayer, Padding } from "./map/engine";
import { MapView } from "./map/MapView";
import { shapeFromDrawing, useExplorer } from "./state";
import { useDrawerViewport } from "./hooks/useDrawerViewport";
import { MapOptions } from "./components/MapOptions";
import { useMapOptions } from "./hooks/useMapOptions";

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mapOptions, setMapOptions] = useMapOptions();
  const [mapOnline, setMapOnline] = useState<boolean | null>(null);
  const drawer = useDrawerViewport(desktop, snap);
  const changeLayer = (next: MapLayer) => {
    explorer.pause();
    setLayer(next);
  };

  const historyAvailable = !!explorer.loaded && "grid" in explorer.loaded;
  // Keep the layer the user picked across places; only fall back when a place has no history.
  useEffect(() => {
    if (explorer.loaded && !historyAvailable) changeLayer("recent");
  }, [explorer.loaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDrawMode((mode) => {
        // Esc first cancels drawing; with nothing to cancel it closes the details panel.
        if (!mode) setDetailsOpen(false);
        return null;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const padding: Padding = desktop
    ? { top: 96, right: 48, bottom: 48, left: detailsOpen ? 48 : 352 }
    : { top: 128, right: 24, bottom: Math.round(window.innerHeight * 0.56), left: 24 };

  const chooseArea = (polygon: GeoJSON.Polygon, label?: string) => {
    setDrawMode(null);
    const shape = shapeFromDrawing(polygon, "Drawn area");
    explorer.setShape(label ? { ...shape, label } : shape);
    if (!desktop) setSnap(SNAPS[1]);
  };

  const play = () => {
    setLayer("history");
    explorer.play();
    if (!desktop) setSnap(SNAPS[0]);
  };

  const overlay = (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-3 lg:p-4 [&>*]:pointer-events-auto"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      <div className="order-2 flex flex-col items-start gap-2 max-sm:ms-auto sm:order-1">
        <PlaceSwitcher
          places={explorer.places}
          current={explorer.place}
          onSelect={explorer.selectPlace}
          onOpen={() => {
            if (!desktop) setSnap(SNAPS[0]);
          }}
        />
        <AnimatePresence>
          {desktop && !detailsOpen && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <ErrorBoundary label="summary">
                <Summary
                  explorer={explorer}
                  showingRecent={layer === "recent"}
                  onDetails={() => setDetailsOpen(true)}
                />
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="order-1 flex max-w-full flex-col items-end gap-2 max-sm:w-full sm:order-2 sm:ms-auto">
        <div className="flex items-start justify-end gap-1.5 sm:gap-2">
          {historyAvailable && layer === "history" && <PlayButton explorer={explorer} onPlay={play} />}
          <LayerSwitch layer={layer} onLayer={changeLayer} historyAvailable={historyAvailable} />
          <MapOptions
            options={mapOptions}
            onChange={setMapOptions}
            online={mapOnline}
            onOpen={() => {
              if (!desktop) setSnap(SNAPS[0]);
            }}
          />
        </div>
      </div>
    </motion.div>
  );

  const map = (
    <ErrorBoundary label="map">
      <MapView
        explorer={explorer}
        layer={layer}
        drawMode={drawMode}
        padding={padding}
        options={mapOptions}
        onOnline={setMapOnline}
        onDrawn={(polygon) => chooseArea(polygon)}
        onIntroDone={() => setIntroDone(true)}
        onGridScale={setGridMax}
      />
    </ErrorBoundary>
  );
  const panel = (
    <ErrorBoundary label="panel">
      <Panel
        explorer={explorer}
        showingRecent={layer === "recent"}
        onShowRecent={() => changeLayer("recent")}
        onPlay={play}
        showCharts
      />
    </ErrorBoundary>
  );

  // On mobile the open drawer carries its own legend, so the map one only shows above the collapsed sheet.
  const legendVisible = introDone && (desktop || snap !== 1);
  // Desktop: between the legend and the zoom buttons. Mobile: above the collapsed sheet.
  const timelineVisible = introDone && historyAvailable && layer === "history" && (desktop || snap === SNAPS[0]);
  const timelineInner = (
    <motion.div
      animate={{ opacity: timelineVisible ? 1 : 0 }}
      transition={{ duration: 0.3 }}
      className={`timeline-host flex min-w-0 ${desktop ? "basis-[19rem] flex-1 justify-center" : "w-full justify-end"} ${timelineVisible ? "" : "hidden"}`}
    >
      <Timeline explorer={explorer} onPlay={play} />
    </motion.div>
  );
  const legendInner = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: legendVisible ? 1 : 0, y: legendVisible ? 0 : 8 }}
      transition={{ duration: 0.4 }}
      className={legendVisible ? "max-w-full" : "hidden"}
    >
      <Legend explorer={explorer} layer={layer} gridMax={gridMax} />
    </motion.div>
  );
  // Desktop: legend and player share one bottom bar; when the map is narrow the player wraps above.
  const legend = desktop ? (
    <div className="pointer-events-none absolute bottom-4 left-4 right-16 z-10 flex flex-wrap-reverse items-end gap-3">
      {legendInner}
      {timelineInner}
    </div>
  ) : (
    <div
      className="pointer-events-none absolute left-3 right-16 z-10 flex flex-col items-start gap-2"
      style={{ bottom: drawer.height + 12 }}
    >
      {timelineInner}
      {legendInner}
    </div>
  );

  if (desktop) {
    return (
      <div className="flex h-full overflow-hidden">
        <main className="relative min-w-0 flex-1 overflow-hidden">
          {map}
          {overlay}
          {legend}
        </main>
        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.aside
              key="details"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 440, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="shrink-0 overflow-hidden border-l border-border bg-surface"
              aria-label="Details and stats"
            >
              <div className="h-full w-[440px] overflow-y-auto">
                <Brand onClose={() => setDetailsOpen(false)} />
                {panel}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      className="mobile-explorer relative h-full overflow-hidden"
      style={
        {
          "--drawer-height": `${drawer.height}px`,
          "--map-controls-visibility": snap === 1 ? "hidden" : "visible",
        } as React.CSSProperties
      }
    >
      {map}
      {overlay}
      {legend}
      <Drawer.Root
        open
        modal={false}
        dismissible={false}
        handleOnly
        onDrag={drawer.track}
        onRelease={drawer.track}
        snapPoints={[...SNAPS]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
      >
        <Drawer.Portal>
          <Drawer.Content
            ref={drawer.ref}
            onPointerUp={() => {
              // Vaul 1.1.2 can bail out of its release handling before snapping when the
              // finger lands on a non-draggable child, leaving the drawer frozen mid-way.
              // After the snap animation settle onto the closest snap point instead.
              window.setTimeout(() => {
                const el = drawer.ref.current;
                if (!el) return;
                const top = el.getBoundingClientRect().top;
                const vh = window.innerHeight;
                const offsets = SNAPS.map((s) => (typeof s === "string" ? vh - parseInt(s, 10) : vh * (1 - s)));
                const closest = offsets.reduce(
                  (best, off, i) => (Math.abs(off - top) < Math.abs(offsets[best] - top) ? i : best),
                  0,
                );
                if (Math.abs(offsets[closest] - top) > 4) {
                  if (SNAPS[closest] === snap) {
                    el.style.transition = "transform 0.3s ease-out";
                    el.style.transform = `translate3d(0, ${offsets[closest]}px, 0)`;
                  } else setSnap(SNAPS[closest]);
                }
              }, 600);
            }}
            onTransitionEnd={drawer.track}
            onAnimationStart={drawer.track}
            onAnimationEnd={drawer.track}
            className="fixed inset-x-0 bottom-0 z-40 flex h-full max-h-[96%] flex-col rounded-t-2xl border-t border-border bg-surface outline-none"
            aria-describedby={undefined}
          >
            <div className="flex h-11 shrink-0 items-center justify-center">
              <Drawer.Handle
                className="!m-0 !bg-border"
                role="button"
                tabIndex={0}
                aria-hidden={false}
                aria-label="Resize details panel"
                onKeyDown={(e) => {
                  const index = SNAPS.findIndex((point) => point === snap);
                  if (["Enter", " ", "ArrowUp", "ArrowDown"].includes(e.key)) {
                    e.preventDefault();
                    setSnap(
                      SNAPS[
                        e.key === "ArrowDown"
                          ? Math.max(0, index - 1)
                          : e.key === "ArrowUp"
                            ? Math.min(2, index + 1)
                            : (index + 1) % SNAPS.length
                      ],
                    );
                  }
                }}
              />
            </div>
            <Drawer.Title className="sr-only">Fire calendar for the selected area</Drawer.Title>
            <div
              className="drawer-scroll min-h-0 shrink-0 overflow-y-auto overscroll-contain"
              data-vaul-no-drag=""
              style={{ height: Math.max(0, drawer.height - 45), paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {panel}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

function Brand({ onClose }: { onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/70 bg-surface px-5 py-3">
      <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="10.5" fill="none" stroke="#4C8DFF" strokeWidth="1.5" />
          <path
            d="M12 5.5c1.8 2.6 4.2 4.6 4.2 7.6a4.2 4.2 0 0 1-8.4 0c0-1.5.7-2.6 1.6-3.6.2 1.3.9 2.2 1.8 2.4-.4-2.3.1-4.4.8-6.4Z"
            fill="#FC3D21"
          />
        </svg>
        <span className="text-sm font-semibold">Fire calendar</span>
      </div>
      <a
        className="text-xs text-muted hover:text-text"
        href="https://firms.modaps.eosdis.nasa.gov/"
        target="_blank"
        rel="noreferrer"
      >
        Data: NASA FIRMS
      </a>
      <button
        className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
        onClick={onClose}
        aria-label="Close details"
        title="Close (Esc)"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
