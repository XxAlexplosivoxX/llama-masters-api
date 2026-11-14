import { useEffect, useMemo, useState } from "react";
import { loadPlace, loadPlaces } from "./lib/data";
import { areaKm2, bboxOf, contains } from "./lib/geo";
import {
  cellsIn, computeStats, fullRange, gridSeries, latestCompleteYear, type Range, weeklyToMonthly,
} from "./lib/series";
import type { BBox, Hotspot, Loaded, MonthlySeries, Place, Shape } from "./lib/types";
import { fmtKm2 } from "./lib/format";

export type Status =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready" };

const PLATFORM_ORDER = ["NOAA-20", "NOAA-21", "S-NPP", "Aqua", "Terra"];

export function useExplorer() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "Loading places" });
  const [shape, setShape] = useState<Shape | null>(null);
  const [areaId, setAreaId] = useState("");
  const [platform, setPlatform] = useState("NOAA-20");
  const [range, setRange] = useState<Range | null>(null);
  const [focusYear, setFocusYear] = useState<number | null>(null);
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  useEffect(() => {
    loadPlaces()
      .then((list) => {
        setPlaces(list);
        setPlaceId(list[0]?.id ?? null);
        if (!list.length) setStatus({ kind: "error", message: "No places are available. Run npm run data:brazil." });
      })
      .catch((error) => setStatus({ kind: "error", message: String(error) }));
  }, []);

  const place = places.find((p) => p.id === placeId) ?? null;

  useEffect(() => {
    if (!place) return;
    const controller = new AbortController();
    setStatus({ kind: "loading", message: `Loading ${place.label}` });
    setLoaded(null);
    setShape(null);
    setRange(null);
    setFocusYear(null);
    loadPlace(place, controller.signal)
      .then((data) => {
        if (data.place.kind === "weekly" && "areas" in data) {
          setAreaId(data.areas.features[0]?.properties.area_id ?? "");
          const available = PLATFORM_ORDER.filter((p) => data.place.kind === "weekly" && data.place.entry.platforms.includes(p));
          setPlatform((current) => (available.includes(current) ? current : available[0] ?? current));
        }
        setLoaded(data);
        setStatus({ kind: "ready" });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatus({ kind: "error", message: `${place.label} could not be loaded: ${error.message ?? error}` });
      });
    return () => controller.abort();
  }, [place]);

  const cells = useMemo(
    () => (loaded && "grid" in loaded ? cellsIn(loaded.grid, shape) : []),
    [loaded, shape],
  );

  const series: MonthlySeries | null = useMemo(() => {
    if (!loaded) return null;
    if ("grid" in loaded) return cells.length ? gridSeries(loaded.grid, cells) : null;
    return weeklyToMonthly(loaded.weekly, platform, areaId);
  }, [loaded, cells, platform, areaId]);

  const seriesRange = useMemo(() => (series ? fullRange(series) : null), [series]);
  const activeRange = range && seriesRange
    ? { from: Math.max(range.from, seriesRange.from), to: Math.min(range.to, seriesRange.to) }
    : seriesRange;

  const stats = useMemo(
    () => (series && activeRange ? computeStats(series, activeRange) : null),
    [series, activeRange?.from, activeRange?.to],
  );

  const defaultFocus = series && stats && activeRange ? latestCompleteYear(stats, activeRange, series.startYear) : null;
  const focus = focusYear ?? defaultFocus;

  const recent: Hotspot[] = useMemo(() => {
    const all = loaded?.recent ?? [];
    return shape ? all.filter((p) => contains(shape.polygon, p.lon, p.lat)) : all;
  }, [loaded, shape]);

  const placeBBox: BBox | null = useMemo(() => {
    if (!loaded) return place?.bbox ?? null;
    if ("areas" in loaded) {
      const area = loaded.areas.features.find((f) => f.properties.area_id === areaId) ?? loaded.areas.features[0];
      return area ? bboxOf(area.geometry) : loaded.place.bbox;
    }
    return loaded.place.bbox;
  }, [loaded, place, areaId]);

  const selectionLabel = shape ? shape.label : loaded && "areas" in loaded
    ? loaded.areas.features.find((f) => f.properties.area_id === areaId)?.properties.name ?? areaId
    : `All of ${place?.label ?? ""}`;

  return {
    places, place, loaded, status,
    shape, setShape: (next: Shape | null) => { setShape(next); setFocusYear(null); },
    areaId, setAreaId, platform, setPlatform,
    series, stats, cells,
    range: activeRange, setRange, resetRange: () => setRange(null),
    focus, setFocusYear,
    hoverMonth, setHoverMonth,
    recent, placeBBox, selectionLabel,
    selectPlace: setPlaceId,
  };
}

export type Explorer = ReturnType<typeof useExplorer>;

export function shapeFromDrawing(polygon: GeoJSON.Polygon, kind: "Drawn area" | "Area"): Shape {
  return { label: `${kind}, ${fmtKm2(areaKm2(polygon))}`, polygon };
}
