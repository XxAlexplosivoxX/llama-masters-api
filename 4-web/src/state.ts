import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PLACE, loadPlace, loadPlaces, type LoadProgress } from "./lib/data";
import { areaKm2, contains } from "./lib/geo";
import { cellValues, cellsIn, computeStats, fullRange, gridSeries, latestCompleteYear, type Range } from "./lib/series";
import type { BBox, Hotspot, Loaded, MonthlySeries, Place, SeriesKind, Shape } from "./lib/types";
import { fmtKm2 } from "./lib/format";
import { sensorOf, type Sensor } from "./lib/color";
import { recentScales, tempScales, type Metric, type TempUnit } from "./lib/temperature";

/** A small preference kept per browser (storage can be unavailable: then it lives in memory only). */
function usePref<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key) as T | null;
      return saved && allowed.includes(saved) ? saved : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Keep the in-memory value. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export type Status =
  | { kind: "loading"; message: string; progress?: LoadProgress[] }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export function useExplorer() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "Loading places" });
  const [shape, setShape] = useState<Shape | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [focusYear, setFocusYear] = useState<number | null>(null);
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
  const [playbackMonth, setPlaybackMonth] = useState<number | null>(null);
  const [metric, setMetric] = usePref<Metric>("map:metric", "count", ["count", "temperature"]);
  const [unit, setUnit] = usePref<TempUnit>("map:unit", "C", ["K", "C", "F"]);
  const [kind, setKind] = useState<SeriesKind>("HARMONIZED");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1× = 4 months per second
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [recentSensors, setRecentSensors] = useState<Record<Sensor, boolean>>({ MODIS: true, VIIRS: true });

  useEffect(() => {
    loadPlaces()
      .then((list) => {
        setPlaces(list);
        setPlaceId((list.find((p) => p.id === DEFAULT_PLACE) ?? list[0])?.id ?? null);
        if (!list.length)
          setStatus({ kind: "error", message: "No places are available: the API returned an empty list." });
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
    loadPlace(place, controller.signal, (progress) => {
      if (!controller.signal.aborted) setStatus({ kind: "loading", message: `Loading ${place.label}`, progress });
    })
      .then((data) => {
        setLoaded(data);
        setStatus({ kind: "ready" });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatus({ kind: "error", message: `${place.label} could not be loaded: ${error.message ?? error}` });
      });
    return () => controller.abort();
  }, [place]);

  const cells = useMemo(() => (loaded ? cellsIn(loaded.grid, shape) : []), [loaded, shape]);

  // Per-cell monthly values for each series, computed once per place.
  const values = useMemo(() => {
    if (!loaded) return null;
    const g = loaded.grid;
    return { HARMONIZED: cellValues(g, "HARMONIZED"), MODIS: cellValues(g, "MODIS"), VIIRS: cellValues(g, "VIIRS") };
  }, [loaded]);

  // Each sensor's temperature colour range, fixed per place so months compare.
  const temps = useMemo(() => (loaded ? tempScales(loaded.grid) : null), [loaded]);
  const recentTemps = useMemo(() => (loaded ? recentScales(loaded.recent) : null), [loaded]);

  const series: MonthlySeries | null = useMemo(() => {
    if (!loaded || !cells.length || !values) return null;
    return gridSeries(loaded.grid, values[kind], cells, kind);
  }, [loaded, values, cells, kind]);

  const seriesRange = useMemo(() => (series ? fullRange(series) : null), [series]);
  const activeRange =
    range && seriesRange && range.to >= seriesRange.from && range.from <= seriesRange.to
      ? { from: Math.max(range.from, seriesRange.from), to: Math.min(range.to, seriesRange.to) }
      : seriesRange;

  // Playback: step the shown month through the selected dates and loop, like a weather radar.
  // A short hold on the last month marks the loop point.
  const playFrom = activeRange?.from ?? 0,
    playTo = activeRange?.to ?? 0;
  const cursor = Math.max(playFrom, Math.min(playbackMonth ?? playFrom, playTo));
  const shownMonth = playing ? cursor : hoverMonth;
  const pause = () => {
    setPlaying(false);
    setHoverMonth(null);
  };
  useEffect(() => {
    if (!playing || !activeRange) return;
    let hold = 0;
    const id = setInterval(() => {
      setPlaybackMonth((m) => {
        if (m === null || m < playFrom || m > playTo) return playFrom;
        if (m === playTo) return hold++ < 3 ? m : ((hold = 0), playFrom);
        return m + 1;
      });
    }, 250 / speed);
    return () => clearInterval(id);
  }, [playing, speed, playFrom, playTo]);
  useEffect(() => {
    setPlaying(false);
    setTimelineOpen(false);
    setHoverMonth(null);
    setPlaybackMonth(null);
  }, [place, shape, kind]);

  const stats = useMemo(
    () => (series && activeRange ? computeStats(series, activeRange) : null),
    [series, activeRange?.from, activeRange?.to],
  );

  const defaultFocus = series && stats && activeRange ? latestCompleteYear(stats, activeRange, series.startYear) : null;
  const focus = focusYear ?? defaultFocus;

  // Last 7 days inside the selection (recentInArea), then narrowed to the sensors switched on (recent).
  const recentInArea: Hotspot[] = useMemo(() => {
    const all = loaded?.recent ?? [];
    return shape ? all.filter((p) => contains(shape.polygon, p.lon, p.lat)) : all;
  }, [loaded, shape]);
  const recent = useMemo(
    () => recentInArea.filter((p) => recentSensors[sensorOf(p.platform)]),
    [recentInArea, recentSensors],
  );

  const placeBBox: BBox | null = loaded?.place.bbox ?? place?.bbox ?? null;
  const selectionLabel = shape ? shape.label : `All of ${place?.label ?? ""}`;

  return {
    places,
    place,
    loaded,
    status,
    shape,
    setShape: (next: Shape | null) => {
      setShape(next);
      setFocusYear(null);
    },
    series,
    stats,
    cells,
    kind,
    setKind,
    values,
    range: activeRange,
    setRange: (next: Range) => {
      pause();
      setRange({ from: Math.min(next.from, next.to), to: Math.max(next.from, next.to) });
    },
    resetRange: () => {
      pause();
      setRange(null);
    },
    seriesRange,
    focus,
    setFocusYear,
    hoverMonth: shownMonth,
    playbackMonth: cursor,
    // Pointer hovers are ignored while playing, so moving the mouse does not fight the timeline.
    setHoverMonth: (m: number | null) => {
      if (!playing) setHoverMonth(m);
    },
    seek: (m: number) => {
      const next = Math.max(playFrom, Math.min(m, playTo));
      setPlaying(false);
      setPlaybackMonth(next);
      setHoverMonth(next);
    },
    playing,
    speed,
    setSpeed,
    timelineOpen,
    play: () => {
      setHoverMonth(null);
      setPlaybackMonth(cursor);
      setTimelineOpen(true);
      setPlaying(true);
    },
    pause,
    stopPlayback: () => {
      setPlaying(false);
      setTimelineOpen(false);
      setHoverMonth(null);
    },
    recent,
    recentInArea,
    recentSensors,
    toggleRecentSensor: (s: Sensor) => setRecentSensors((old) => ({ ...old, [s]: !old[s] })),
    placeBBox,
    selectionLabel,
    selectPlace: setPlaceId,
    metric,
    setMetric,
    unit,
    setUnit,
    temps,
    recentTemps,
  };
}

export type Explorer = ReturnType<typeof useExplorer>;

export function shapeFromDrawing(polygon: GeoJSON.Polygon, kind: "Drawn area" | "Area"): Shape {
  return { label: `${kind}, ${fmtKm2(areaKm2(polygon))}`, polygon };
}
