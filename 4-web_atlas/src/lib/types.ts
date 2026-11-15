// Shapes of the files the API serves (3-api_atlas), written by 2-process_data/src/export.py.

export type BBox = [west: number, south: number, east: number, north: number];

export type SensorId = "MODIS" | "VIIRS";
/**
 * What the calendar counts: the harmonized record on the NOAA-20 scale (default), raw MODIS
 * (Terra + Aqua), or the harmonized record only where VIIRS observed it.
 */
export type SeriesKind = "HARMONIZED" | SensorId;

/** How each month of the record was made. */
export type MonthSource = "observed" | "reconstructed" | null;

/** Per-month facts shared by monthly.json and monthly_grid.json. */
interface MonthAxis {
  id: string;
  label: string;
  generated_at_utc: string;
  start_month: string; // YYYY-MM of index 0
  months: number;
  source: MonthSource[]; // observed: real VIIRS; reconstructed: converted MODIS
  satellite: (string | null)[]; // NOAA-20 | NOAA-21 | S-NPP | MODIS
  partial: boolean[]; // not fully covered (the month in progress, a sensor starting mid-month)
  provisional: boolean[]; // near-real-time rows
}

/** Flat [monthIndex, value, ...] pairs in ascending month order; only nonzero values. */
export type SparseSeries = number[];

/**
 * One series of exports/<id>/monthly_grid.json (version 5), as flat columns over the cells in order:
 * `count` nonzero months per cell; `gap` = month index minus the previous nonzero month of the same
 * cell (the first is the month itself); `value` = value x `scale`, an integer.
 */
export interface SparseColumns {
  scale: number;
  count: number[];
  gap: number[];
  value: number[];
}

/** exports/<id>/monthly_grid.json as served (decoded by data.ts into MonthlyGrid). */
export interface MonthlyGridFile extends MonthAxis {
  version: 5 | 6; // 6 adds brightness temperatures
  unit: string;
  cell_deg: number;
  series: ["modis", "viirs_eq"];
  cells: { west: number[]; south: number[] };
  modis: SparseColumns;
  viirs_eq: SparseColumns;
  modis_bt?: number[]; // v6: mean MODIS brightness temperature (K) for each MODIS value above, 0 = none
  viirs_bt?: SparseColumns; // v6: mean VIIRS I4 brightness temperature (K), its own months
}

/** The grid in memory: one entry per cell with its sparse [month, value, ...] pairs. */
export interface MonthlyGrid extends MonthAxis {
  unit: string;
  cell_deg: number;
  cell_degs?: number[]; // per cell, when grids of several countries (different cell sizes) are merged
  cells: [
    west: number,
    south: number,
    modis: SparseSeries,
    viirsEq: SparseSeries,
    modisBt: SparseSeries, // mean brightness temperature (K) per month: MODIS, pair for pair with `modis` (0 = none)
    viirsBt: SparseSeries, // and VIIRS (I4); empty for exports before v6
  ][];
}

export interface AreaScore {
  model: "cell" | "ratio_fm";
  test_months: number;
  wape?: { cell: number | null; ratio_fm: number | null; fixed: number | null };
  bias?: number | null;
  year_rank_spearman?: number | null;
  band?: [number, number] | null;
  band_coverage?: number | null;
}

/** One area (the country or a state) of monthly.json. */
export interface AreaSeries {
  id: string; // "country" or the state's geoBoundaries id
  name: string;
  model: AreaScore["model"];
  series: {
    MODIS: (number | null)[];
    "S-NPP": (number | null)[];
    "NOAA-20": (number | null)[];
    "NOAA-21": (number | null)[];
    viirs_eq: (number | null)[];
    p10: (number | null)[];
    p90: (number | null)[];
    modis_eq: (number | null)[];
  };
  baseline: {
    years: [number, number];
    median: (number | null)[];
    mean: (number | null)[];
    p25: (number | null)[];
    p75: (number | null)[];
  };
  score: AreaScore;
}

/** exports/<id>/monthly.json */
export interface MonthlyFile extends MonthAxis {
  unit: string;
  reference: string;
  sensors: string[];
  areas: AreaSeries[];
}

export interface SatelliteSpan {
  first_day: string;
  last_day: string;
  provisional_from_day: string | null;
  rows: number;
}

/** exports/<id>/meta.json */
export interface Meta {
  id: string;
  label: string;
  iso: string[];
  generated_at_utc: string;
  last_day: string;
  start_month: string;
  months: number;
  sensors: Record<string, SatelliteSpan>; // Terra, Aqua, S-NPP, NOAA-20, NOAA-21
  record: { reference: string; observed_from: string | null; method: string };
  harmonization: {
    direction: string;
    fit_months: number;
    fit_years: [number, number] | null;
    k_cell: number;
    modis_to_snpp: number | null;
    f_npp: number | null;
    f21: number | null;
    calendar_month_factor: (number | null)[];
    terra_factor: (number | null)[];
    world: { modis_to_snpp: number | null; f_npp: number | null; f21: number | null };
    model: AreaScore["model"];
    score: AreaScore;
    states_on_fallback: string[];
  };
  grid: { cell_deg: number; values: number };
  sources: string[];
  limitations: string[];
}

/** exports/<id>/recent_hotspots.json: columnar points of the last days. */
export interface RecentColumns {
  last_day: string;
  days: number;
  platforms: string[];
  states: string[];
  lon: number[];
  lat: number[];
  acquired_utc: string[];
  platform: number[]; // index into platforms
  state: number[]; // index into states, -1 outside every state
  confidence: string[]; // MODIS 0-100, VIIRS n/h (as FIRMS reports it)
  frp: (number | null)[];
  bright?: (number | null)[]; // brightness temperature, K (MODIS or VIIRS I4)
}

export interface Hotspot {
  lon: number;
  lat: number;
  acquired_utc: string;
  platform: string;
  confidence: string;
  frp: number;
  bright: number | null; // brightness temperature, K
  state: string | null;
}

/** exports/places.json entry */
export interface Place {
  id: string;
  label: string;
  kind: "country" | "global"; // global: no data of its own; countries are picked on the map
  iso: string[];
  bbox: BBox;
  states: number;
  first_month: string;
  last_day: string;
  version?: string; // hash of the place's files; sent as ?v= so caches never serve an older export
}

export interface Loaded {
  place: Place;
  grid: MonthlyGrid;
  monthly: MonthlyFile;
  meta: Meta;
  recent: Hotspot[];
  outline: GeoJSON.MultiPolygon | null; // the country's border, drawn over the map
  parts?: Loaded[]; // Global: the countries merged into this one, each as loaded
}

/** A user-drawn or typed area; null means the whole place. */
export interface Shape {
  label: string;
  polygon: GeoJSON.Polygon;
}

/** One value per calendar month starting at January of startYear. */
export interface MonthlySeries {
  startYear: number;
  values: (number | null)[]; // null: no source data
  partial: boolean[]; // month not fully covered: never compared with complete months
  source: string;
  kind?: SeriesKind;
  provisionalFrom?: number; // month index where near-real-time (provisional) data begins
  baselineFrom?: number; // earlier complete years are shown but kept out of averages
  baselineNote?: string;
}
