import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import type { ExpressionSpecification, GeoJSONSource, StyleSpecification } from "maplibre-gl";
// MapLibre finds its worker relative to its own module URL, which Vite's
// pre-bundling changes; let Vite bundle the worker and pass its URL instead.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode, ValidateNotSelfIntersecting } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { HEAT, SENSOR, sensorOf } from "../lib/color";
import type { BBox, Hotspot } from "../lib/types";

setWorkerUrl(workerUrl);

const BASEMAP = "https://tiles.openfreemap.org/styles/dark";
const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#121829" } }],
};
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export type MapLayer = "history" | "recent";
export type DrawMode = "rectangle" | "polygon";
export type Padding = { top: number; right: number; bottom: number; left: number };

export interface GridCells {
  cellDeg: number;
  cells: { west: number; south: number; value: number }[];
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
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
});

function hotspotHTML(p: Record<string, string | number>): string {
  const platform = String(p.platform);
  const sensor = sensorOf(platform);
  const { color, pixel } = SENSOR[sensor];
  const row = (k: string, v: string) => `<dt>${k}</dt><dd>${escape(v)}</dd>`;
  return `<div class="hp-head"><span class="hp-badge" style="--c:${color}">${sensor}</span>`
    + `<span class="hp-sat">${escape(platform)}</span></div>`
    + `<p class="hp-when">${escape(WHEN.format(new Date(String(p.acquired_utc))))} UTC</p><dl>`
    + row("Fire radiative power", `${Number(p.frp).toFixed(1)} MW`)
    + row("Confidence", String(p.confidence))
    + row("Pass", p.daynight === "D" ? "Daytime" : "Nighttime")
    + row("Pixel size", pixel)
    + "</dl>";
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function heatRamp(input: ExpressionSpecification, max: number): ExpressionSpecification {
  const stops = HEAT.flatMap((color, i) => [(Math.sqrt(Math.max(max, 1)) * i) / (HEAT.length - 1), color]);
  return ["interpolate", ["linear"], ["sqrt", input], ...stops] as unknown as ExpressionSpecification;
}

export class MapEngine {
  readonly online: boolean;
  private map: MapLibreMap;
  private draw: TerraDraw;
  private onDraw: (polygon: GeoJSON.Polygon) => void;
  private layer: MapLayer = "history";
  private introFrame = 0;
  private gridMax = 1;
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

    // Data covers land, water and roads; borders and place names stay above it for orientation.
    // Fewer basemap labels: countries, states and large cities orient; everything else competes with the data.
    const HIDE = ["water_name", "road_oneway", "road_oneway_opposite", "highway_name_other", "highway_name_motorway",
      "place_other", "place_suburb", "place_village", "place_town"];
    for (const id of HIDE) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    if (map.getLayer("place_city")) map.setLayerZoomRange("place_city", 6, 24);
    if (map.getLayer("place_state")) {
      map.setLayerZoomRange("place_state", 4, 24);
      map.setPaintProperty("place_state", "text-opacity", 0.6);
    }
    const firstLabel = map.getStyle().layers.find((l) =>
      "source-layer" in l && ["boundary", "place"].includes(String(l["source-layer"])))?.id;

    map.addSource("grid", { type: "geojson", data: EMPTY });
    map.addSource("recent", { type: "geojson", data: EMPTY });
    map.addSource("mask", { type: "geojson", data: EMPTY });
    map.addSource("areas", { type: "geojson", data: EMPTY });
    map.addSource("outline", { type: "geojson", data: EMPTY });

    map.addLayer({
      id: "grid", type: "fill", source: "grid",
      paint: { "fill-color": HEAT[0], "fill-opacity": 0, "fill-opacity-transition": { duration: 700, delay: 0 } },
    }, firstLabel);
    // Heatmap layers do not render on the globe projection; a blurred halo plus a
    // core dot per detection reads as density at low zoom and as points up close.
    // Colour says which sensor saw it (MODIS amber, VIIRS cyan); size grows with fire radiative power.
    // MODIS sits on top as a larger, see-through disc, echoing its 1 km pixel against VIIRS's 375 m.
    const isModis: ExpressionSpecification = ["==", ["get", "s"], "M"];
    const sensorColor: ExpressionSpecification = ["case", isModis, SENSOR.MODIS.color, SENSOR.VIIRS.color];
    const power: ExpressionSpecification = ["*", ["case", isModis, 1.7, 1],
      ["interpolate", ["linear"], ["get", "frp"], 0, 0.8, 20, 1, 100, 1.5, 500, 2.2]];
    map.addLayer({
      id: "recent-heat", type: "circle", source: "recent",
      paint: {
        "circle-color": sensorColor,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, ["*", 2, power], 6, ["*", 6, power], 10, ["*", 12, power]],
        "circle-blur": 1,
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.12, 8, 0.2],
      },
    }, firstLabel);
    map.addLayer({
      id: "recent-dots", type: "circle", source: "recent",
      layout: { "circle-sort-key": ["case", isModis, 1, 0] },
      paint: {
        "circle-color": sensorColor,
        "circle-radius": ["interpolate", ["linear"], ["zoom"],
          2, ["*", 0.7, power], 6, ["*", 1.6, power], 10, ["*", 4, power], 14, ["*", 8, power]],
        "circle-opacity": ["case", isModis, 0.5, 0.9],
        "circle-stroke-color": ["case", isModis, SENSOR.MODIS.color, "#0B0F1A"],
        // Zoom must be the outermost input, so the sensor switch goes inside each stop.
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"],
          4, 0, 7, ["case", isModis, 1, 0], 8, ["case", isModis, 1.1, 0], 12, ["case", isModis, 1.5, 1]],
      },
    }, firstLabel);
    map.addLayer({ id: "mask", type: "fill", source: "mask", paint: { "fill-color": "#0B0F1A", "fill-opacity": 0.55 } });
    map.addLayer({
      id: "areas", type: "line", source: "areas",
      paint: { "line-color": "#9AA6C0", "line-width": 1, "line-opacity": 0.6 },
    });
    map.addLayer({
      id: "outline", type: "line", source: "outline",
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

  setGrid({ cellDeg, cells }: GridCells, max: number) {
    if (this.destroyed) return;
    this.gridMax = max;
    const features: GeoJSON.Feature[] = [];
    for (const { west: w, south: s, value } of cells) {
      if (value <= 0) continue;
      const e = w + cellDeg, n = s + cellDeg;
      features.push({
        type: "Feature",
        properties: { v: value },
        geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      });
    }
    (this.map.getSource("grid") as GeoJSONSource).setData({ type: "FeatureCollection", features });
    this.map.setPaintProperty("grid", "fill-color", heatRamp(["get", "v"], this.gridMax));
  }

  setRecent(points: Hotspot[]) {
    if (this.destroyed) return;
    const first = points.length ? Date.parse(points[0].acquired_utc) : 0;
    (this.map.getSource("recent") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          t: (Date.parse(p.acquired_utc) - first) / 60000,
          frp: p.frp, platform: p.platform, acquired_utc: p.acquired_utc, confidence: p.confidence, daynight: p.daynight,
          s: sensorOf(p.platform) === "MODIS" ? "M" : "V",
        },
      })),
    });
  }

  setLayer(layer: MapLayer) {
    if (this.destroyed) return;
    this.layer = layer;
    const recent = layer === "recent" ? "visible" : "none";
    this.map.setLayoutProperty("recent-heat", "visibility", recent);
    this.map.setLayoutProperty("recent-dots", "visibility", recent);
    this.map.setPaintProperty("grid", "fill-opacity", layer === "history" ? 0.82 : 0);
    this.map.triggerRepaint();
  }

  setAreas(areas: GeoJSON.FeatureCollection | null) {
    if (this.destroyed) return;
    (this.map.getSource("areas") as GeoJSONSource).setData(areas ?? EMPTY);
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
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    mask.setData({
      type: "Feature", properties: {},
      geometry: { type: "Polygon", coordinates: [world, [...polygon.coordinates[0]].reverse()] },
    });
  }

  fit(bbox: BBox, padding: Padding, duration = 1400) {
    if (this.destroyed) return;
    this.map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
      padding, duration: reducedMotion() ? 0 : duration, maxZoom: 9, essential: false,
    });
  }

  /**
   * Opening sequence: the globe turns to the place while the last seven days of
   * detections appear in acquisition order, then the history grid fades in.
   */
  /** Resolves once MapLibre has tiled these sources (large GeoJSON takes a moment in the worker). */
  private sourcesReady(ids: string[], timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => { this.map.off("sourcedata", check); clearTimeout(timer); resolve(); };
      const check = () => { if (this.destroyed || ids.every((id) => this.map.isSourceLoaded(id))) done(); };
      const timer = setTimeout(done, timeout);
      this.map.on("sourcedata", check);
      check();
    });
  }

  async intro(bbox: BBox, padding: Padding, onFrame?: (progress: number, minutes: number) => void): Promise<void> {
    const maxT = 7 * 24 * 60;
    const filtered = ["recent-heat", "recent-dots"];
    if (reducedMotion()) {
      this.fit(bbox, padding, 0);
      return Promise.resolve();
    }
    const duration = 4200;
    this.map.setPaintProperty("grid", "fill-opacity", 0);
    for (const id of filtered) this.map.setFilter(id, ["<=", ["get", "t"], -1]);
    await this.sourcesReady(["recent", "grid"], 5000);
    if (this.destroyed) return;
    this.map.setLayoutProperty("recent-heat", "visibility", "visible");
    this.map.setLayoutProperty("recent-dots", "visibility", "visible");
    this.map.setPaintProperty("grid", "fill-opacity", 0);
    this.fit(bbox, padding, duration);
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        if (this.destroyed) return resolve();
        const k = Math.min((now - start) / duration, 1);
        const t = maxT * (1 - (1 - k) ** 2);
        for (const id of filtered) this.map.setFilter(id, ["<=", ["get", "t"], t]);
        onFrame?.(k, t);
        if (k < 1) {
          this.introFrame = requestAnimationFrame(step);
          return;
        }
        for (const id of filtered) this.map.setFilter(id, null);
        this.setLayer(this.layer);
        resolve();
      };
      this.introFrame = requestAnimationFrame(step);
    });
  }
}
