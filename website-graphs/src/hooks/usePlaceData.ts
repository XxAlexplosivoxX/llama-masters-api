import { useEffect, useMemo, useRef, useState } from "react";
import { csvLast7, csvMonthly, parseFirmsText, type FirmsResult } from "../lib/csv";
import {
  annualComparison, cellValues, cellsIn, computeStats, fullRange, gridSeries, latestCompleteYear, localCheck,
  bboxPolygon, loadPlace, loadPlaces, weeklyToMonthly, type LoadProgress, type Range,
} from "../lib/shared";
import { loadWeeklyCore, loadWeeklyRecent } from "../lib/weeklyLoader";
import { SATELLITE_ORDER, type CsvPoint, type Hotspot, type Loaded, type MonthlySeries, type Place, type SeriesKind } from "../types";
import { CSV_PLACE_ID } from "../state";
import { useGraphsStore, useStore } from "./useGraphsStore";

export type Status =
  | { kind: "loading"; message: string; progress?: LoadProgress[] }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export interface CsvPlaceData {
  result: FirmsResult;
  platforms: string[];
}

const ym = (startYear: number) => (index: number) =>
  `${startYear + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

export function usePlaceData() {
  const store = useStore();
  const placeId = useGraphsStore((s) => s.placeId);
  const areaId = useGraphsStore((s) => s.areaId);
  const platform = useGraphsStore((s) => s.platform);
  const kind = useGraphsStore((s) => s.kind);
  const range = useGraphsStore((s) => s.range);
  const focusYear = useGraphsStore((s) => s.focusYear);
  const csv = useGraphsStore((s) => s.csv);
  const bbox = useGraphsStore((s) => s.bbox);
  const baseline2012 = useGraphsStore((s) => s.baseline2012);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [csvData, setCsvData] = useState<CsvPlaceData | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "Loading places" });
  const [weeklyRecent, setWeeklyRecent] = useState<{ placeId: string; areaId: string | null; points: Hotspot[] | null; truncated: boolean } | null>(null);
  const [recentStatus, setRecentStatus] = useState<"loading" | "ready" | "unavailable">("unavailable");
  const selections = useRef({ areaId, platform });
  selections.current = { areaId, platform };

  // Restore the uploaded CSV from the session; pick the first real place afterwards.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("graphs:csv");
      if (saved) {
        const { name, text } = JSON.parse(saved) as { name: string; text: string };
        store.actions.loadCsv(name, text);
      }
    } catch { /* session storage unavailable or too large */ }
    loadPlaces()
      .then((list) => {
        setPlaces(list);
        if (!store.getState().placeId) {
          store.actions.setPlace((list.find((p) => p.id === "brazil") ?? list[0])?.id ?? null);
        }
        if (!list.length) setStatus({ kind: "error", message: "No places are available." });
      })
      .catch((error) => setStatus({ kind: "error", message: String(error) }));
  }, []);

  const isCsv = placeId === CSV_PLACE_ID;
  const place = places.find((p) => p.id === placeId) ?? null;

  useEffect(() => {
    if (isCsv) {
      if (!csv) { setCsvData(null); setStatus({ kind: "error", message: "Choose a FIRMS CSV file to analyse." }); return; }
      parseFirmsText(csv.text)
        .then((result) => {
          setCsvData({ result, platforms: result.platforms });
          const available = SATELLITE_ORDER.filter((p) => (result.platforms as string[]).includes(p));
          if (!available.includes(selections.current.platform)) store.actions.setPlatform(available[0]);
          setLoaded(null);
          setStatus({ kind: "ready" });
        })
        .catch((error) => setStatus({ kind: "error", message: `${csv.name} could not be parsed: ${error.message ?? error}` }));
      return;
    }
    setCsvData(null);
    if (!place) { setLoaded(null); return; }
    const controller = new AbortController();
    setStatus({ kind: "loading", message: `Loading ${place.label}` });
    setLoaded(null);
    const loadCore = place.kind === "weekly"
      ? loadWeeklyCore(place, controller.signal)
      : loadPlace(place, controller.signal, (progress) => {
      if (!controller.signal.aborted) setStatus({ kind: "loading", message: `Loading ${place.label}`, progress });
    });
    loadCore
      .then((data) => {
        if (data.place.kind === "weekly" && "areas" in data) {
          const first = data.areas.features[0]?.properties.area_id ?? null;
          if (!selections.current.areaId || !data.areas.features.some((f) => f.properties.area_id === selections.current.areaId)) {
            store.actions.setArea(first);
          }
          const available = SATELLITE_ORDER.filter((p) => data.place.kind === "weekly" && data.place.entry.platforms.includes(p));
          if (!available.includes(selections.current.platform) && available.length) {
            store.actions.setPlatform(available[0]);
          }
        }
        setLoaded(data);
        setStatus({ kind: "ready" });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setStatus({ kind: "error", message: `${place.label} could not be loaded: ${error.message ?? error}` });
      });
    return () => controller.abort();
  }, [place, isCsv, csv]);

  useEffect(() => {
    if (!place || place.kind !== "weekly" || !loaded || !("areas" in loaded) || loaded.place.id !== place.id) {
      setWeeklyRecent(null);
      setRecentStatus("unavailable");
      return;
    }
    const controller = new AbortController();
    const requestedArea = areaId ?? null;
    setWeeklyRecent(null);
    setRecentStatus("loading");
    loadWeeklyRecent(place, controller.signal, requestedArea).then((result) => {
      if (controller.signal.aborted || placeId !== place.id || (store.getState().areaId ?? null) !== requestedArea) return;
      setWeeklyRecent({ placeId: place.id, areaId: requestedArea, points: result.points, truncated: result.truncated });
      setRecentStatus(result.points ? "ready" : "unavailable");
    }).catch(() => {
      if (!controller.signal.aborted && placeId === place.id && (store.getState().areaId ?? null) === requestedArea) {
        setWeeklyRecent({ placeId: place.id, areaId: requestedArea, points: null, truncated: false });
        setRecentStatus("unavailable");
      }
    });
    return () => controller.abort();
  }, [place, loaded, areaId, placeId, store]);

  // Grid cells whose centre falls in the area of interest (every cell for the whole place).
  const cells = useMemo(
    () => (loaded && "grid" in loaded
      ? cellsIn(loaded.grid, bbox ? { label: "Area of interest", polygon: bboxPolygon(bbox) } : null)
      : []),
    [loaded, bbox],
  );

  const values = useMemo(() => {
    if (!loaded || !("grid" in loaded)) return null;
    const g = loaded.grid;
    return {
      HARMONIZED: cellValues(g, "HARMONIZED"), MODIS: cellValues(g, "MODIS"),
      VIIRS: cellValues(g, "VIIRS"), MODIS_EQ: cellValues(g, "MODIS_EQ"),
    } satisfies Record<SeriesKind, number[][]>;
  }, [loaded]);

  const baseSeries: MonthlySeries | null = useMemo(() => {
    if (isCsv) return csvData ? csvMonthly(csvData.result, platform) : null;
    if (!loaded) return null;
    if ("grid" in loaded) return cells.length && values ? gridSeries(loaded.grid, values[kind], cells, kind) : null;
    return weeklyToMonthly(loaded.weekly, platform, areaId ?? "");
  }, [isCsv, csvData, loaded, values, cells, kind, platform, areaId]);

  // Optional VIIRS-era baseline: only moves baselineFrom, so the series values are untouched.
  const series = useMemo(() => (baseSeries && baseline2012
    ? { ...baseSeries, baselineFrom: Math.max(baseSeries.baselineFrom ?? 2012, 2012), baselineNote: "Averages use 2012 onward (VIIRS era), chosen in the toolbar." }
    : baseSeries), [baseSeries, baseline2012]);

  const harmonization = useMemo(() => {
    if (!loaded || !("grid" in loaded) || !values || !cells.length) return null;
    return {
      check: localCheck(loaded.grid, values.MODIS, values.MODIS_EQ, cells),
      annual: annualComparison(loaded.grid, values, cells),
    };
  }, [loaded, values, cells]);

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

  /** Point records for the "last 7 days" card, normalized to date/platform/frp/daynight. */
  const recent: CsvPoint[] = useMemo(() => {
    if (isCsv) return csvData ? csvLast7(csvData.result) : [];
    // Same rule as the monthly cells: a point counts when the centre of its grid cell is in the box.
    const picked = loaded && "grid" in loaded && bbox ? loaded.grid : null;
    const keep = picked ? new Set(cells.map((i) => `${picked.cells[i][0]}:${picked.cells[i][1]}`)) : null;
    const inBox = (p: { lon: number; lat: number }) => {
      if (!keep || !picked) return true;
      const d = picked.cell_deg, [w0, s0] = picked.cells[0];
      const w = w0 + Math.floor((p.lon - w0) / d) * d, s = s0 + Math.floor((p.lat - s0) / d) * d;
      return keep.has(`${w}:${s}`);
    };
    const points = loaded?.place.kind === "weekly"
      ? (weeklyRecent?.placeId === placeId && weeklyRecent.areaId === (areaId ?? null) ? weeklyRecent.points ?? [] : [])
      : loaded?.recent ?? [];
    return points.filter((p) => SATELLITE_ORDER.includes(p.platform) && inBox(p)).map((p) => ({
      date: p.acquired_utc.slice(0, 10),
      platform: p.platform as CsvPoint["platform"],
      frp: Number.isFinite(p.frp) ? p.frp : null,
      daynight: p.daynight === "D" || p.daynight === "N" ? p.daynight : null,
      lon: p.lon, lat: p.lat,
    }));
  }, [isCsv, csvData, loaded, bbox, cells, weeklyRecent, placeId, areaId]);

  const areas = useMemo(() => {
    if (isCsv) return csv ? [{ id: "upload", name: csv.name }] : [];
    return loaded && "areas" in loaded
      ? loaded.areas.features.map((f) => ({ id: f.properties.area_id, name: f.properties.name }))
      : [];
  }, [isCsv, csv, loaded]);

  const platforms = useMemo(() => {
    if (isCsv) return csvData?.platforms ?? [];
    return loaded?.place.kind === "weekly" ? loaded.place.entry.platforms : [];
  }, [isCsv, csvData, loaded]);

  const setRange = (next: Range | null) =>
    store.actions.setRange(next, series ? ym(series.startYear) : undefined);

  const weeklyRecentMatches = weeklyRecent?.placeId === placeId && weeklyRecent.areaId === (areaId ?? null);
  const currentRecentStatus = isCsv || loaded?.place.kind === "grid"
    ? "ready" as const
    : loaded?.place.kind === "weekly" && loaded.place.id === placeId
      ? weeklyRecentMatches ? (weeklyRecent?.points ? "ready" as const : "unavailable" as const) : "loading" as const
      : recentStatus;

  return {
    status, places, place, loaded, isCsv, csvData, csv,
    areas, platforms, series, stats, values, cells, harmonization,
    range: activeRange, setRange, seriesRange,
    focus, recent, bbox, recentStatus: currentRecentStatus,
    recentTruncated: !!weeklyRecent?.truncated && weeklyRecentMatches,
    selectPlace: store.actions.setPlace,
  };
}

export type PlaceData = ReturnType<typeof usePlaceData>;
