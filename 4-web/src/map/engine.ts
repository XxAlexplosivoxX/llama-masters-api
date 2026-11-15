import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import type { ExpressionSpecification, GeoJSONSource, StyleSpecification } from "maplibre-gl";
// MapLibre finds its worker relative to its own module URL, which Vite's
// pre-bundling changes; let Vite bundle the worker and pass its URL instead.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode, ValidateNotSelfIntersecting } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { HEAT, SENSOR, sensorOf } from "../lib/color";
import type { BBox, Hotspot } from "../lib/types";
import type { MapOptions } from "../hooks/useMapOptions";

setWorkerUrl(workerUrl);

const BASEMAP = "https://tiles.openfreemap.org/styles/dark";
const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#121829" } }],
};
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const RECENT_LAYERS = ["recent-heat", "recent-dots"];

export type MapLayer = "history" | "recent";
export type DrawMode = "rectangle" | "polygon";
export type Padding = { top: number; right: number; bottom: number; left: number };

export interface GridCells {
  cellDeg: number;
  cells: { west: number; south: number }[];
}

async function chooseStyle(): Promise<{ style: string | StyleSpecification; online: boolean }> {
  try {
    const response = await fetch(BASEMAP, { signal: AbortSignal.timeout(5000) });
    if (response.ok) return { style: BASEMAP, online: true };
  } catch {
    // offline or blocked: use the fallback below
  }
  return { style: OFFLINE_STYLE, online: false };
}

const escape = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** FIRMS confidence as reported: MODIS 0-100, VIIRS n/h (or nominal/high). */
function confidenceLabel(value: string): string {
  const v = value.toLowerCase();
  if (/^\d+$/.test(v)) return `${v}%`;
  return v.startsWith("h") ? "High" : v.startsWith("n") ? "Nominal" : v.startsWith("l") ? "Low" : value;
}

function hotspotHTML(p: Record<string, string | number>): string {
  const platform = String(p.platform);
  const sensor = sensorOf(platform);
  const { color, pixel } = SENSOR[sensor];
  const row = (k: string, v: string) => `<dt>${k}</dt><dd>${escape(v)}</dd>`;
  return (
    `<div class="hp-head"><span class="hp-badge" style="--c:${color}">${sensor}</span>` +
    `<span class="hp-sat">${escape(platform)}</span></div>` +
    `<p class="hp-when">${escape(WHEN.format(new Date(String(p.acquired_utc))))} UTC</p><dl>` +
    row("Fire radiative power", `${Number(p.frp).toFixed(1)} MW`) +
    row("Confidence", confidenceLabel(String(p.confidence))) +
    (p.state ? row("State", String(p.state)) : "") +
    row("Pixel size", pixel) +
    "</dl>"
  );
}

const container = (map: MapLibreMap) => map.getContainer();

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Square-root heat ramp on the cell's feature-state value; cells at zero are transparent. */
function heatRamp(max: number): ExpressionSpecification {
  const v: ExpressionSpecification = ["coalesce", ["feature-state", "v"], 0];
  const stops = HEAT.flatMap((color, i) => [(Math.sqrt(Math.max(max, 1)) * i) / (HEAT.length - 1), color]);
  return [
    "case",
    ["<=", v, 0],
    "rgba(0,0,0,0)",
    ["interpolate", ["linear"], ["sqrt", v], ...stops],
  ] as unknown as ExpressionSpecification;
}

export class MapEngine {
  readonly online: boolean;
  private map: MapLibreMap;
  private draw: TerraDraw;
  private onDraw: (polygon: GeoJSON.Polygon) => void;
  private layer: MapLayer = "history";
  private introFrame = 0;
  private gridMax = -1;
  private gridOpacity = 0.82;
  private basemap: MapOptions["basemap"] | "dark" = "dark"; // dark = the style itself, used offline
  private labels = true;
  private borders = true;
  private baseLayers: StyleSpecification["layers"];
  private gridValues: number[] = [];
  private skip = false;
  private gridPending = false;
  private introRunning = false;
  private destroyed = false;

  static async create(container: HTMLElement, onDraw: (polygon: GeoJSON.Polygon) => void, signal: AbortSignal) {
    const { style, online } = await chooseStyle();
    if (signal.aborted) throw new DOMException("Map initialization cancelled", "AbortError");
    const map = new MapLibreMap({
      container,
      style,
      // Start on South America; the minimum zoom keeps the globe from shrinking to a dot.
      center: [-58, -12],
      zoom: 1.7,
      minZoom: 1.7,
      renderWorldCopies: false,
      attributionControl: { compact: true },
      maxPitch: 0,
      dragRotate: false,
    });
    const removeEarly = () => map.remove();
    signal.addEventListener("abort", removeEarly, { once: true });
    await new Promise<void>((resolve) => map.once("load", () => resolve()));
    // Wait until the first tiles are drawn, so the opening never plays over an empty screen.
    await Promise.race([
      new Promise<void>((resolve) => map.once("idle", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 6000)),
    ]);
    if (signal.aborted) throw new DOMException("Map initialization cancelled", "AbortError");
    signal.removeEventListener("abort", removeEarly);
    return new MapEngine(map, online, onDraw);
  }

  private constructor(map: MapLibreMap, online: boolean, onDraw: (polygon: GeoJSON.Polygon) => void) {
    this.map = map;
    this.online = online;
    this.onDraw = onDraw;
    map.setProjection({ type: "globe" });
    if (import.meta.env.DEV) Object.assign(window, { __map: map });
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    // Compact attribution starts expanded on wide maps and covers the bottom bar; start it folded.
    container(map).querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");

    // Data covers land, water and roads; borders and place names stay above it for orientation.
    // Fewer basemap labels: countries, states and large cities orient; everything else competes with the data.
    const HIDE = [
      "water_name",
      "road_oneway",
      "road_oneway_opposite",
      "highway_name_other",
      "highway_name_motorway",
      "place_other",
      "place_suburb",
      "place_village",
      "place_town",
    ];
    for (const id of HIDE) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    if (map.getLayer("place_city")) map.setLayerZoomRange("place_city", 6, 24);
    if (map.getLayer("place_state")) {
      map.setLayerZoomRange("place_state", 4, 24);
      map.setPaintProperty("place_state", "text-opacity", 0.6);
    }
    for (const id of ["place_state", "place_city", "place_city_large", "place_capital"]) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, "text-opacity", 0.45);
      map.setPaintProperty(id, "text-color", "#9AA6C0");
      map.setPaintProperty(id, "text-halo-width", 0.5);
    }
    // Snapshot after thinning: restoring Dark must preserve the original hidden layers and label paint.
    this.baseLayers = map.getStyle().layers;
    const background = this.baseLayers.findIndex((l) => l.type === "background");
    const aboveBackground = this.baseLayers[background + 1]?.id;
    for (const [id, product, date, extension] of [
      ["satellite", "BlueMarble_ShadedRelief_Bathymetry", "2004-08-01", "jpeg"],
      ["night", "VIIRS_Black_Marble", "2016-01-01", "png"],
    ]) {
      map.addSource(`gibs-${id}`, {
        type: "raster",
        tileSize: 256,
        maxzoom: 8,
        attribution: "Imagery: NASA EOSDIS GIBS",
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product}/default/${date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.${extension}`,
        ],
      });
      map.addLayer(
        {
          id: `gibs-${id}`,
          type: "raster",
          source: `gibs-${id}`,
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.85, "raster-saturation": id === "satellite" ? -0.2 : 0 },
        },
        aboveBackground,
      );
    }
    const firstLabel = map
      .getStyle()
      .layers.find((l) => "source-layer" in l && ["boundary", "place"].includes(String(l["source-layer"])))?.id;

    map.addSource("grid", { type: "geojson", data: EMPTY });
    // Up to ~140k points: a small tile buffer and capped zoom keep the worker's tiling cheap.
    map.addSource("recent", { type: "geojson", data: EMPTY, buffer: 16, maxzoom: 10 });
    map.addSource("mask", { type: "geojson", data: EMPTY });
    map.addSource("areas", { type: "geojson", data: EMPTY });
    map.addSource("outline", { type: "geojson", data: EMPTY });
    map.addSource("country", { type: "geojson", data: EMPTY });

    map.addLayer(
      {
        id: "grid",
        type: "fill",
        source: "grid",
        paint: { "fill-color": HEAT[0], "fill-opacity": 0, "fill-opacity-transition": { duration: 700, delay: 0 } },
      },
      firstLabel,
    );
    // Heatmap layers do not render on the globe projection; a blurred halo plus a
    // core dot per detection reads as density at low zoom and as points up close.
    // Colour says which sensor saw it (MODIS amber, VIIRS cyan); size grows with fire radiative power.
    // MODIS sits on top as a larger, see-through disc, echoing its 1 km pixel against VIIRS's 375 m.
    const isModis: ExpressionSpecification = ["==", ["get", "s"], "M"];
    const sensorColor: ExpressionSpecification = ["case", isModis, SENSOR.MODIS.color, SENSOR.VIIRS.color];
    const dotColor: ExpressionSpecification = ["case", isModis, `${SENSOR.MODIS.color}88`, SENSOR.VIIRS.color];
    const power: ExpressionSpecification = [
      "*",
      ["case", isModis, 1.7, 1],
      ["interpolate", ["linear"], ["get", "frp"], 0, 0.8, 20, 1, 100, 1.5, 500, 2.2],
    ];
    // Performance rules learned the hard way: changing a filter or a layout property makes the worker
    // re-process the whole source, and layers at opacity 0 are still processed in every tile load, so
    // the 7-day layers are switched with `visibility` (once per toggle) and never filtered per frame.
    map.addLayer(
      {
        id: "recent-heat",
        type: "circle",
        source: "recent",
        layout: { visibility: "none" },
        paint: {
          "circle-color": sensorColor,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            ["*", 2, power],
            6,
            ["*", 6, power],
            10,
            ["*", 12, power],
          ],
          "circle-blur": 1,
          "circle-opacity": 0.16,
          "circle-opacity-transition": { duration: 0, delay: 0 },
        },
      },
      firstLabel,
    );
    map.addLayer(
      {
        id: "recent-dots",
        type: "circle",
        source: "recent",
        // No circle-sort-key (it sorts every tile); setRecent orders MODIS last so it draws on top.
        layout: { visibility: "none" },
        paint: {
          "circle-color": dotColor,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            ["*", 0.7, power],
            6,
            ["*", 1.6, power],
            10,
            ["*", 4, power],
            14,
            ["*", 8, power],
          ],
          "circle-opacity": 0.9,
          "circle-opacity-transition": { duration: 0, delay: 0 },
          "circle-stroke-color": ["case", isModis, SENSOR.MODIS.color, "#0B0F1A"],
          // Zoom must be the outermost input, so the sensor switch goes inside each stop.
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0,
            7,
            ["case", isModis, 1, 0],
            8,
            ["case", isModis, 1.1, 0],
            12,
            ["case", isModis, 1.5, 1],
          ],
        },
      },
      firstLabel,
    );
    map.addLayer({
      id: "mask",
      type: "fill",
      source: "mask",
      paint: { "fill-color": "#0B0F1A", "fill-opacity": 0.55 },
    });
    map.addLayer({
      id: "areas",
      type: "line",
      source: "areas",
      paint: { "line-color": "#9AA6C0", "line-width": 1, "line-opacity": 0.6 },
    });
    // The selected country's border: a dark halo under a light line reads on imagery and on the grid.
    map.addLayer({
      id: "country-halo",
      type: "line",
      source: "country",
      layout: { "line-join": "round" },
      paint: { "line-color": "#0B0F1A", "line-width": 5, "line-opacity": 0.55, "line-blur": 2 },
    });
    map.addLayer({
      id: "country",
      type: "line",
      source: "country",
      layout: { "line-join": "round" },
      paint: { "line-color": "#E8ECF5", "line-width": 1.6, "line-opacity": 0.95 },
    });
    map.addLayer({
      id: "outline",
      type: "line",
      source: "outline",
      paint: { "line-color": "#4C8DFF", "line-width": 2, "line-dasharray": [2, 1.5] },
    });

    map.on("click", "recent-dots", (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      new Popup({ closeButton: true, maxWidth: "260px", className: "hotspot-popup" })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setHTML(hotspotHTML(feature.properties as Record<string, string | number>))
        .addTo(map);
    });
    map.on("mouseenter", "recent-dots", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "recent-dots", () => (map.getCanvas().style.cursor = ""));

    const styles = { fillColor: "#4C8DFF", fillOpacity: 0.12, outlineColor: "#4C8DFF", outlineWidth: 2 } as const;
    this.draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawRectangleMode({ styles }),
        new TerraDrawPolygonMode({
          styles: { ...styles, closingPointColor: "#4C8DFF", closingPointOutlineColor: "#E8ECF5" },
          // A point that would make the outline cross itself is refused, so every shape has a clear inside.
          validation: (feature) => ValidateNotSelfIntersecting(feature),
        }),
      ],
    });
    this.draw.start();
    this.draw.on("finish", (id) => {
      const feature = this.draw.getSnapshotFeature(id);
      if (feature?.geometry.type === "Polygon") this.onDraw(feature.geometry as GeoJSON.Polygon);
      // The selection outline layer takes over; terra-draw's copy is dropped.
      setTimeout(() => this.stopDrawing(), 0);
    });
    this.setLayer("history");
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.introFrame);
    this.draw.stop();
    this.map.remove();
  }

  resize() {
    if (this.destroyed) return;
    this.map.resize();
  }

  setBasemap(value: MapOptions["basemap"]) {
    if (this.destroyed) return;
    const next = this.online ? value : "dark";
    if (next === this.basemap) return;
    this.basemap = next;
    for (const id of ["satellite", "night"]) {
      this.map.setLayoutProperty(`gibs-${id}`, "visibility", next === id ? "visible" : "none");
    }
    for (const layer of this.baseLayers) {
      if (
        ["fill", "line", "fill-extrusion"].includes(layer.type) &&
        !("source-layer" in layer && layer["source-layer"] === "boundary")
      ) {
        this.map.setLayoutProperty(layer.id, "visibility", next === "dark" ? layer.layout?.visibility : "none");
      }
      if (layer.type === "symbol" && layer.layout?.visibility !== "none" && layer.layout?.["text-field"]) {
        // Stronger text and dark halos keep names readable over bright imagery; Dark restores exact paint.
        const paint = {
          "text-opacity": 0.85,
          "text-color": "#E8ECF5",
          "text-halo-color": "#0B0F1A",
          "text-halo-width": 1.2,
        } as const;
        for (const key of Object.keys(paint) as (keyof typeof paint)[]) {
          this.map.setPaintProperty(layer.id, key, next === "dark" ? layer.paint?.[key] : paint[key]);
        }
      }
    }
  }

  setLabels(on: boolean) {
    if (this.destroyed || on === this.labels) return;
    this.labels = on;
    this.updateBaseVisibility();
  }

  setBorders(on: boolean) {
    if (this.destroyed || on === this.borders) return;
    this.borders = on;
    this.updateBaseVisibility();
  }

  private updateBaseVisibility() {
    for (const layer of this.baseLayers) {
      const boundary = "source-layer" in layer && layer["source-layer"] === "boundary";
      if (layer.type !== "symbol" && !boundary) continue;
      const visible = (layer.type !== "symbol" || this.labels) && (!boundary || this.borders);
      const value = visible ? layer.layout?.visibility : "none";
      if (this.map.getLayoutProperty(layer.id, "visibility") !== value) {
        this.map.setLayoutProperty(layer.id, "visibility", value);
      }
    }
  }

  setProjection(type: MapOptions["projection"]) {
    if (this.destroyed) return;
    this.map.setProjection({ type });
  }

  setGridOpacity(value: number) {
    if (this.destroyed || !Number.isFinite(value)) return;
    this.gridOpacity = Math.max(0.3, Math.min(1, value));
    if (this.layer === "history" && !this.gridPending && !this.introRunning) this.applyGridOpacity(true);
  }

  private applyGridOpacity(immediate = false) {
    this.map.setPaintProperty("grid", "fill-opacity-transition", { duration: immediate ? 0 : 700, delay: 0 });
    this.map.setPaintProperty(
      "grid",
      "fill-opacity",
      this.layer === "history" && !this.gridPending && !this.introRunning ? this.gridOpacity : 0,
    );
  }

  startDrawing(mode: DrawMode) {
    if (this.destroyed) return;
    this.draw.clear();
    this.draw.setMode(mode);
    this.map.getCanvas().style.cursor = "crosshair";
  }

  stopDrawing() {
    if (this.destroyed) return;
    this.draw.clear();
    this.draw.setMode("static");
    this.map.getCanvas().style.cursor = "";
  }

  /**
   * Cell squares, set once per place or selection. Values change through feature-state
   * (setGridValues), so hovering or playing months never re-tiles the geometry.
   */
  setGridCells({ cellDeg, cells }: GridCells) {
    if (this.destroyed) return;
    const features: GeoJSON.Feature[] = cells.map(({ west: w, south: s }, id) => {
      const e = w + cellDeg,
        n = s + cellDeg;
      return {
        type: "Feature",
        id,
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        },
      };
    });
    this.map.removeFeatureState({ source: "grid" });
    this.gridValues = [];
    this.gridPending = true;
    this.applyGridOpacity();
    const source = this.map.getSource("grid") as GeoJSONSource;
    source.setData({ type: "FeatureCollection", features }).then(() => {
      if (this.destroyed) return;
      this.gridPending = false;
      if (this.layer === "history" && !this.introRunning) this.applyGridOpacity();
    });
  }

  /** One value per cell from setGridCells, in the same order; only changed cells are touched. */
  setGridValues(values: number[], max: number) {
    if (this.destroyed) return;
    for (let id = 0; id < values.length; id++) {
      if (values[id] !== this.gridValues[id]) this.map.setFeatureState({ source: "grid", id }, { v: values[id] });
    }
    this.gridValues = values;
    // A new paint expression rebuilds the layer's shader inputs; only do it when the scale changes.
    if (max !== this.gridMax) {
      this.gridMax = max;
      this.map.setPaintProperty("grid", "fill-color", heatRamp(max));
    }
  }

  /** Ends the opening animation now (the user started exploring). */
  skipIntro() {
    this.skip = true;
  }

  setRecent(points: Hotspot[]) {
    if (this.destroyed) return;
    const first = points.length ? Date.parse(points[0].acquired_utc) : 0;
    (this.map.getSource("recent") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [...points]
        .sort((a, b) => Number(sensorOf(a.platform) === "MODIS") - Number(sensorOf(b.platform) === "MODIS"))
        .map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          properties: {
            t: (Date.parse(p.acquired_utc) - first) / 60000,
            frp: p.frp,
            platform: p.platform,
            acquired_utc: p.acquired_utc,
            confidence: p.confidence,
            state: p.state ?? "",
            s: sensorOf(p.platform) === "MODIS" ? "M" : "V",
          },
        })),
    });
  }

  /** Shows or hides the 7-day layers. Visibility only changes when it has to: each change reloads the source. */
  private showRecent(on: boolean) {
    const value = on ? "visible" : "none";
    for (const id of RECENT_LAYERS)
      if (this.map.getLayoutProperty(id, "visibility") !== value) this.map.setLayoutProperty(id, "visibility", value);
  }

  setLayer(layer: MapLayer) {
    if (this.destroyed) return;
    this.layer = layer;
    this.showRecent(layer === "recent");
    this.applyGridOpacity();
    this.map.triggerRepaint();
  }

  setAreas(areas: GeoJSON.FeatureCollection | null) {
    if (this.destroyed) return;
    (this.map.getSource("areas") as GeoJSONSource).setData(areas ?? EMPTY);
  }

  /** The selected country's border (null clears it). */
  setCountry(geometry: GeoJSON.MultiPolygon | null) {
    if (this.destroyed) return;
    const source = this.map.getSource("country") as GeoJSONSource | undefined;
    void source?.setData(geometry ? { type: "Feature", properties: {}, geometry } : EMPTY);
  }

  /** Dashed outline around the selection, with everything outside it dimmed. */
  setSelection(polygon: GeoJSON.Polygon | null) {
    if (this.destroyed) return;
    const outline = this.map.getSource("outline") as GeoJSONSource;
    const mask = this.map.getSource("mask") as GeoJSONSource;
    if (!polygon) {
      outline.setData(EMPTY);
      mask.setData(EMPTY);
      return;
    }
    outline.setData({ type: "Feature", properties: {}, geometry: polygon });
    const world = [
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ];
    mask.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [world, [...polygon.coordinates[0]].reverse()] },
    });
  }

  fit(bbox: BBox, padding: Padding, duration = 1400) {
    if (this.destroyed) return;
    this.map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      {
        padding,
        duration: reducedMotion() ? 0 : duration,
        maxZoom: 9,
        essential: false,
      },
    );
  }

  /**
   * Opening sequence: the globe turns to the place, then the history grid fades in.
   */
  /** Resolves once MapLibre has tiled these sources (large GeoJSON takes a moment in the worker). */
  private sourcesReady(ids: string[], timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.map.off("sourcedata", check);
        clearTimeout(timer);
        resolve();
      };
      const check = () => {
        if (this.destroyed || ids.every((id) => this.map.isSourceLoaded(id))) done();
      };
      const timer = setTimeout(done, timeout);
      this.map.on("sourcedata", check);
      check();
    });
  }

  async intro(bbox: BBox, padding: Padding, onFrame?: (progress: number, minutes: number) => void): Promise<void> {
    const maxT = 7 * 24 * 60;
    if (reducedMotion()) {
      this.fit(bbox, padding, 0);
      return Promise.resolve();
    }
    const duration = 3200;
    this.introRunning = true;
    this.map.setPaintProperty("grid", "fill-opacity", 0);
    this.showRecent(false);
    await Promise.race([
      this.sourcesReady(["grid"], 5000),
      new Promise<void>((r) => {
        const poll = setInterval(() => {
          if (this.skip) {
            clearInterval(poll);
            r();
          }
        }, 50);
        setTimeout(() => clearInterval(poll), 5000);
      }),
    ]);
    if (this.destroyed) {
      this.introRunning = false;
      return;
    }
    this.fit(bbox, padding, duration);
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        if (this.destroyed) return resolve();
        const k = this.skip ? 1 : Math.min((now - start) / duration, 1);
        const t = maxT * (1 - (1 - k) ** 2);
        onFrame?.(k, t);
        if (k < 1) {
          this.introFrame = requestAnimationFrame(step);
          return;
        }
        this.introRunning = false;
        this.setLayer(this.layer);
        resolve();
      };
      this.introFrame = requestAnimationFrame(step);
    });
  }
}
