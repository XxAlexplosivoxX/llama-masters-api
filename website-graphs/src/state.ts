import type { Range } from "./lib/shared";
import type { SeriesKind } from "./types";

export interface GraphsState {
  placeId: string | null;
  areaId: string | null;
  platform: string;
  kind: SeriesKind;
  range: Range | null; // month indexes, inclusive, relative to series.startYear
  focusYear: number | null;
  focusMonth: number | null; // month index into the series
  csv: { name: string; text: string } | null;
  bbox: BBox | null; // area of interest inside the place; null = whole place
}

export type BBox = [west: number, south: number, east: number, north: number];

type EventMap = {
  filters: { placeId: string | null; areaId: string | null; platform: string; kind: SeriesKind; from: string | null; to: string | null; bbox: BBox | null };
  focus: { year: number | null; month: string | null };
};
type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void;

export interface GraphsStore {
  getState: () => GraphsState;
  setState: (partial: Partial<GraphsState>) => void;
  subscribe: (listener: () => void) => () => void;
  on: <K extends keyof EventMap>(event: K, handler: Handler<K>) => () => void;
  actions: {
    setPlace: (placeId: string | null) => void;
    setArea: (areaId: string | null) => void;
    setPlatform: (platform: string) => void;
    setKind: (kind: SeriesKind) => void;
    setRange: (range: Range | null, ym?: (index: number) => string) => void;
    focusYear: (year: number | null) => void;
    focusMonth: (month: number | null, ym?: string) => void;
    loadCsv: (name: string, text: string) => void;
    setBbox: (bbox: BBox | null) => void;
  };
}

const initialState = (): GraphsState => ({
  placeId: null,
  areaId: null,
  platform: "NOAA-20",
  kind: "HARMONIZED",
  range: null,
  focusYear: null,
  focusMonth: null,
  csv: null,
  bbox: null,
});

export const CSV_PLACE_ID = "csv:upload";

export function createGraphsStore(initial?: Partial<GraphsState>): GraphsStore {
  let state: GraphsState = { ...initialState(), ...initial };
  const listeners = new Set<() => void>();
  const handlers = new Map<keyof EventMap, Set<Handler<keyof EventMap>>>();

  const emit = <K extends keyof EventMap>(event: K, payload: EventMap[K]) => {
    handlers.get(event)?.forEach((h) => (h as Handler<K>)(payload));
  };
  const update = (partial: Partial<GraphsState>) => {
    state = { ...state, ...partial };
    listeners.forEach((l) => l());
  };
  const filters = (ym?: (index: number) => string): EventMap["filters"] => ({
    placeId: state.placeId,
    areaId: state.areaId,
    platform: state.platform,
    kind: state.kind,
    from: state.range && ym ? ym(state.range.from) : null,
    to: state.range && ym ? ym(state.range.to) : null,
    bbox: state.bbox,
  });

  return {
    getState: () => state,
    setState: update,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as Handler<keyof EventMap>);
      handlers.set(event, set);
      return () => set.delete(handler as Handler<keyof EventMap>);
    },
    actions: {
      setPlace: (placeId) => {
        update({ placeId, areaId: null, bbox: null, range: null, focusYear: null, focusMonth: null });
        emit("filters", filters());
      },
      setArea: (areaId) => { update({ areaId }); emit("filters", filters()); },
      // Weekly/CSV series start in each platform's first year, so stored month indexes are reset.
      setPlatform: (platform) => { update({ platform, range: null, focusYear: null, focusMonth: null }); emit("filters", filters()); },
      setKind: (kind) => { update({ kind, focusMonth: null }); emit("filters", filters()); },
      setRange: (range, ym) => {
        update({ range, focusYear: null, focusMonth: null });
        emit("filters", filters(ym));
      },
      focusYear: (year) => { update({ focusYear: year }); emit("focus", { year, month: null }); },
      focusMonth: (month, ym) => { update({ focusMonth: month }); emit("focus", { year: state.focusYear, month: ym ?? null }); },
      loadCsv: (name, text) => {
        update({ csv: { name, text }, placeId: CSV_PLACE_ID, areaId: "upload", bbox: null, range: null, focusYear: null, focusMonth: null });
        emit("filters", filters());
      },
      setBbox: (bbox) => { update({ bbox, focusMonth: null }); emit("filters", filters()); },
    },
  };
}

export const graphsStore = createGraphsStore();
