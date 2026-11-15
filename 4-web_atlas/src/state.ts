import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PLACE, loadPlace, loadPlaces, type LoadProgress } from "./lib/data";
import { areaKm2, contains } from "./lib/geo";
import { cellValues, cellsIn, computeStats, fullRange, gridSeries, type Range } from "./lib/series";
import type { BBox, Hotspot, Loaded, MonthlySeries, Place, SeriesKind, Shape } from "./lib/types";
import { fmtKm2 } from "./lib/format";
import { sensorOf, type Sensor } from "./lib/color";
import { recentScales, tempScales, type Metric, type TempUnit } from "./lib/temperature";
import {
  countriesIn,
  countryAt,
  GLOBAL_ID,
  globalPlace,
  isHeavy,
  listLabel,
  mergeLoaded,
} from "./lib/global";

/**
 * Countries loaded for Global, kept for the session so picking one more downloads only that one.
 * Progress goes to whichever Global load is listening.
 */
const loads = new Map<string, Promise<Loaded>>();
const progressOf = new Map<string, LoadProgress[]>();
let onLoadProgress: (() => void) | null = null;
function loadCached(place: Place, keep: string[]): Promise<Loaded> {
  let hit = loads.get(place.id);
  if (!hit) {
    hit = loadPlace(place, undefined, (p) => {
      progressOf.set(place.id, p);
      onLoadProgress?.();
    });
    hit.catch(() => loads.delete(place.id));
    loads.set(place.id, hit);
    // Forget countries no longer picked once the cache holds many (each grid can be several MB).
    if (loads.size > 10) for (const id of loads.keys()) if (!keep.includes(id)) loads.delete(id);
  }
  return hit;
}

/** Countries waiting for the user to accept a load that may slow the map down. */
export interface PendingPick {
  places: Place[];
  shape: Shape | null;
}

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
  // A month clicked in the calendar stays on the map until clicked again; hovering previews others.
  const [pinnedMonth, setPinnedMonth] = useState<number | null>(null);
  const [playbackMonth, setPlaybackMonth] = useState<number | null>(null);
  const [metric, setMetric] = usePref<Metric>("map:metric", "count", ["count", "temperature"]);
  const [unit, setUnit] = usePref<TempUnit>("map:unit", "C", ["K", "C", "F"]);
  const [kind, setKind] = useState<SeriesKind>("HARMONIZED");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1× = 4 months per second
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [recentSensors, setRecentSensors] = useState<Record<Sensor, boolean>>({ MODIS: true, VIIRS: true });
  // Global: the countries picked (clicked, or touched by a drawn area) and a download waiting for approval.
  const [picks, setPicks] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingPick | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warned, setWarned] = useState(false); // the slow-down warning is shown once per Global visit
  // Clicks resolve their country asynchronously; read the selection as it is then, not as it was.
  const latest = useRef({ picks, shape });
  latest.current = { picks, shape };

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

  const world = useMemo(() => (places.length ? globalPlace(places) : null), [places]);
  const isGlobal = placeId === GLOBAL_ID;
  const place = isGlobal ? world : (places.find((p) => p.id === placeId) ?? null);

  useEffect(() => {
    if (!place) return;
    setPicks([]);
    setPending(null);
    setNotice(null);
    setWarned(false);
    if (place.kind === "global") {
      setLoaded(null);
      setShape(null);
      setRange(null);
      setFocusYear(null);
      setStatus({ kind: "ready" });
      return;
    }
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

  // Global: load the picked countries (cached ones at once) and merge them.
  const picksKey = picks.join(",");
  useEffect(() => {
    if (!isGlobal) return;
    if (!picks.length) {
      setLoaded(null);
      setStatus({ kind: "ready" });
      return;
    }
    const chosen = picks.map((id) => places.find((p) => p.id === id)).filter((p): p is Place => !!p);
    const message = `Loading ${listLabel(chosen)}`;
    let cancelled = false;
    const report = () => {
      if (cancelled) return;
      const steps = (["history", "recent"] as const).map((step, i) => {
        const all = chosen.map((p) => progressOf.get(p.id)?.[i]).filter((s): s is LoadProgress => !!s);
        return {
          step,
          label: all[0]?.label ?? "",
          loaded: all.reduce((a, s) => a + s.loaded, 0),
          total: all.length === chosen.length && all.every((s) => s.total !== null)
            ? all.reduce((a, s) => a + s.total!, 0)
            : null,
        };
      });
      setStatus({ kind: "loading", message, progress: steps });
    };
    onLoadProgress = report;
    setStatus({ kind: "loading", message });
    Promise.all(chosen.map((p) => loadCached(p, picks)))
      .then((parts) => {
        if (cancelled) return;
        setLoaded(mergeLoaded(parts));
        setStatus({ kind: "ready" });
      })
      .catch((error) => {
        if (!cancelled) setStatus({ kind: "error", message: `${message.slice(8)} could not be loaded: ${error.message ?? error}` });
      });
    return () => {
      cancelled = true;
      if (onLoadProgress === report) onLoadProgress = null;
    };
  }, [isGlobal, picksKey]);

  /** Apply a Global pick at once, or hold it for approval when loading it may slow the map down. */
  const offer = async (chosen: Place[], nextShape: Shape | null, adding: boolean) => {
    if (adding && !warned && (await isHeavy(chosen))) setPending({ places: chosen, shape: nextShape });
    else {
      setPending(null);
      setPicks(chosen.map((p) => p.id));
      setShape(nextShape);
    }
  };

  const cells = useMemo(() => (loaded ? cellsIn(loaded.grid, shape) : []), [loaded, shape]);

  // Per-cell monthly values for each series, computed once per place.
  const values = useMemo(() => {
    if (!loaded) return null;
    const g = loaded.grid;
    return { HARMONIZED: cellValues(g, "HARMONIZED"), MODIS: cellValues(g, "MODIS"), VIIRS: cellValues(g, "VIIRS") };
  }, [loaded]);

  // Each sensor's temperature colour range, fixed per place so months compare.
  // Null when the grid has no temperatures (version 5 files).
  const temps = useMemo(() => {
    const t = loaded ? tempScales(loaded.grid) : null;
    return t && (t.MODIS.lo > 0 || t.VIIRS.lo > 0) ? t : null;
  }, [loaded]);
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
  const shownMonth = playing ? cursor : (hoverMonth ?? pinnedMonth);
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
    setPinnedMonth(null);
    setPlaybackMonth(null);
  }, [place, shape, kind]);

  const stats = useMemo(
    () => (series && activeRange ? computeStats(series, activeRange) : null),
    [series, activeRange?.from, activeRange?.to],
  );

  // The year in progress while it has any source data, else the latest year that does.
  const defaultFocus = useMemo(() => {
    if (!series) return null;
    const hasData = (y: number) =>
      series.values.slice((y - series.startYear) * 12, (y - series.startYear) * 12 + 12).some((v) => v !== null);
    if (hasData(new Date().getUTCFullYear())) return new Date().getUTCFullYear();
    for (let y = series.startYear + Math.floor((series.values.length - 1) / 12); y >= series.startYear; y--)
      if (hasData(y)) return y;
    return null;
  }, [series]);
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
  const selectionLabel = shape
    ? shape.label
    : isGlobal
      ? loaded
        ? `All of ${loaded.place.label}`
        : "Global"
      : `All of ${place?.label ?? ""}`;

  return {
    places,
    place,
    loaded,
    status,
    shape,
    setShape: (next: Shape | null) => {
      setShape(next);
      setFocusYear(null);
      if (isGlobal && !next) setPicks([]);
    },
    isGlobal,
    picks,
    pending,
    notice,
    /** Global: the countries a drawn or typed area touches become the selection, clipped to the area. */
    pickArea: async (polygon: GeoJSON.Polygon, label: string) => {
      setNotice("Finding the countries in this area…");
      const found = await countriesIn(places, polygon);
      setNotice(found.length ? null : "No country with fire data in this area. Try a larger area or one over land.");
      if (found.length) await offer(found, { polygon, label }, true);
    },
    /** Global: a click adds the country under it, or removes it when it is already picked. */
    toggleCountryAt: async (lon: number, lat: number) => {
      const hit = await countryAt(places, lon, lat);
      if (!hit) return;
      setNotice(null);
      // After a drawn area, a click starts a selection of whole countries.
      const base = latest.current.shape ? [] : latest.current.picks;
      const removing = base.includes(hit.id);
      const next = (removing ? base.filter((id) => id !== hit.id) : [...base, hit.id])
        .map((id) => places.find((p) => p.id === id))
        .filter((p): p is Place => !!p);
      if (!next.length) {
        setPicks([]);
        setShape(null);
        return;
      }
      await offer(next, null, !removing);
    },
    confirmPending: () => {
      if (!pending) return;
      setPicks(pending.places.map((p) => p.id));
      setShape(pending.shape);
      setPending(null);
      setWarned(true);
    },
    cancelPending: () => setPending(null),
    dismissNotice: () => setNotice(null),
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
      setPinnedMonth(null);
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
    pinnedMonth,
    /** Pins a month on the map, or unpins it when it is already pinned. */
    togglePin: (m: number) => {
      setPlaying(false);
      setPinnedMonth((old) => (old === m ? null : m));
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
      setPinnedMonth(null);
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
