import { useEffect, useMemo, useState } from "react";
import { loadPlace, loadPlaces, type LoadProgress } from "./lib/data";
import { areaKm2, bboxOf, contains } from "./lib/geo";
import {
  annualComparison, cellValues, cellsIn, computeStats, fullRange, gridSeries, latestCompleteYear, localCheck, type Range,
  weeklyToMonthly,
} from "./lib/series";
import type { BBox, Hotspot, Loaded, MonthlySeries, Place, SeriesKind, Shape } from "./lib/types";
import { fmtKm2 } from "./lib/format";
import { sensorOf, type Sensor } from "./lib/color";

export type Status =
  | { kind: "loading"; message: string; progress?: LoadProgress[] }
  | { kind: "error"; message: string }
  | { kind: "empty"; message: string }
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
  const [playbackMonth, setPlaybackMonth] = useState<number | null>(null);
  const [kind, setKind] = useState<SeriesKind>("HARMONIZED");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1× = 4 months per second
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [recentSensors, setRecentSensors] = useState<Record<Sensor, boolean>>({ MODIS: true, VIIRS: true });

  useEffect(() => {
    loadPlaces()
      .then((list) => {
        setPlaces(list);
        // Brazil is the MVP and opens first; South America and the other countries are one click away.
        setPlaceId((list.find((p) => p.id === "brazil") ?? list[0])?.id ?? null);
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
    if (place.kind === "grid" && place.empty) {
      setStatus({ kind: "empty", message: `No hotspot records for ${place.label} yet. The area is on the map, but its monthly history and last 7 days have not been built.` });
      return;
    }
    loadPlace(place, controller.signal, (progress) => {
      if (!controller.signal.aborted) setStatus({ kind: "loading", message: `Loading ${place.label}`, progress });
    })
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

  // Per-cell monthly values for each series, computed once per place.
  const values = useMemo(() => {
    if (!loaded || !("grid" in loaded)) return null;
    const g = loaded.grid;
    return {
      HARMONIZED: cellValues(g, "HARMONIZED"), MODIS: cellValues(g, "MODIS"), VIIRS: cellValues(g, "VIIRS"), MODIS_EQ: cellValues(g, "MODIS_EQ"),
    };
  }, [loaded]);

  const series: MonthlySeries | null = useMemo(() => {
    if (!loaded) return null;
    if ("grid" in loaded) return cells.length && values ? gridSeries(loaded.grid, values[kind], cells, kind) : null;
    return weeklyToMonthly(loaded.weekly, platform, areaId);
  }, [loaded, values, cells, kind, platform, areaId]);

  const harmonization = useMemo(() => {
    if (!loaded || !("grid" in loaded) || !values || !cells.length) return null;
    return {
      check: localCheck(loaded.grid, values.MODIS, values.MODIS_EQ, cells),
      annual: annualComparison(loaded.grid, values, cells),
    };
  }, [loaded, values, cells]);

  const seriesRange = useMemo(() => (series ? fullRange(series) : null), [series]);
  const activeRange = range && seriesRange && range.to >= seriesRange.from && range.from <= seriesRange.to
    ? { from: Math.max(range.from, seriesRange.from), to: Math.min(range.to, seriesRange.to) }
    : seriesRange;

  // Playback: step the shown month through the selected dates and loop, like a weather radar.
  // A short hold on the last month marks the loop point.
  const playFrom = activeRange?.from ?? 0, playTo = activeRange?.to ?? 0;
  const cursor = Math.max(playFrom, Math.min(playbackMonth ?? playFrom, playTo));
  const shownMonth = playing ? cursor : hoverMonth;
  const pause = () => { setPlaying(false); setHoverMonth(null); };
  useEffect(() => {
    if (!playing || !activeRange) return;
    let hold = 0;
    const id = setInterval(() => {
      setPlaybackMonth((m) => {
        if (m === null || m < playFrom || m > playTo) return playFrom;
        if (m === playTo) return hold++ < 3 ? m : (hold = 0, playFrom);
        return m + 1;
      });
    }, 250 / speed);
    return () => clearInterval(id);
  }, [playing, speed, playFrom, playTo]);
  useEffect(() => { setPlaying(false); setTimelineOpen(false); setHoverMonth(null); setPlaybackMonth(null); }, [place, shape, kind, areaId, platform]);

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
    series, stats, cells, kind, setKind, values, harmonization,
    range: activeRange,
    setRange: (next: Range) => { pause(); setRange({ from: Math.min(next.from, next.to), to: Math.max(next.from, next.to) }); },
    resetRange: () => { pause(); setRange(null); },
    seriesRange,
    focus, setFocusYear,
    hoverMonth: shownMonth,
    playbackMonth: cursor,
    // Pointer hovers are ignored while playing, so moving the mouse does not fight the timeline.
    setHoverMonth: (m: number | null) => { if (!playing) setHoverMonth(m); },
    seek: (m: number) => {
      const next = Math.max(playFrom, Math.min(m, playTo));
      setPlaying(false); setPlaybackMonth(next); setHoverMonth(next);
    },
    playing, speed, setSpeed, timelineOpen,
    play: () => { setHoverMonth(null); setPlaybackMonth(cursor); setTimelineOpen(true); setPlaying(true); },
    pause,
    stopPlayback: () => { setPlaying(false); setTimelineOpen(false); setHoverMonth(null); },
    recent, recentInArea, recentSensors,
    toggleRecentSensor: (s: Sensor) => setRecentSensors((old) => ({ ...old, [s]: !old[s] })),
    placeBBox, selectionLabel,
    selectPlace: setPlaceId,
  };
}

export type Explorer = ReturnType<typeof useExplorer>;

export function shapeFromDrawing(polygon: GeoJSON.Polygon, kind: "Drawn area" | "Area"): Shape {
  return { label: `${kind}, ${fmtKm2(areaKm2(polygon))}`, polygon };
}
