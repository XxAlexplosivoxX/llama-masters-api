// Contract shapes from llama-masters-research scripts/prepare_region.py (docs/data-contract.md).

export interface RegionEntry {
  name: string;
  start: string;
  end: string;
  platforms: string[];
  areas: number;
  hotspots: { first_day: string; last_day: string; features: number };
}

export interface WeeklyRow {
  area_id: string;
  week_start: string;
  week_end: string; // following Monday, exclusive
  iso_week: string; // e.g. "2026-W42"
  instrument: "MODIS" | "VIIRS";
  platform: string;
  reported_detections: number | null; // null: no source data that week
  source_days: number;
  source_complete: boolean;
  week_complete: boolean;
  observation_coverage: string;
}

export interface Metadata {
  name: string;
  generated_at_utc: string;
  sources: string[];
  quality_rules: string[];
  harmonization_status: string;
  observation_coverage: string;
  limitations: string[];
}

export interface AreaProperties {
  area_id: string;
  name: string;
}

export type BBox = [west: number, south: number, east: number, north: number];

export type SensorId = "MODIS" | "VIIRS";
/**
 * What the calendar counts: the harmonized record (default), one sensor's raw hotspots,
 * or VIIRS rescaled to the MODIS scale.
 */
export type SeriesKind = "HARMONIZED" | SensorId | "MODIS_EQ";

export interface SensorInfo {
  series: string;
  first_source_month: string;
  first_source_day: string;
  last_source_day: string;
  provisional_from_day: string | null; // near-real-time from this day on
  baseline_from_year: number;
  baseline_note: string;
  quality_rules: string[];
  processing: string[];
}

export interface Scores { wape: number; bias: number; r: number }

export interface Harmonization {
  target: string;
  method: string;
  train_years: [number, number];
  test_years: [number, number];
  coefficients: { month: number; beta: number; k: number; pairs: number }[];
  single_ratio: number;
  train: { years: [number, number]; months: number; model: Scores; single_ratio: Scores; raw_viirs: Scores };
  test: { years: [number, number]; months: number; model: Scores; single_ratio: Scores; raw_viirs: Scores };
  caveats: string[];
}

/** Monthly detections on a regular grid, written by scripts/build-country.mjs. */
export interface MonthlyGrid {
  version: 2;
  name: string;
  label: string;
  unit: string;
  cell_deg: number;
  start_month: string; // YYYY-MM of index 0
  months: number;
  sensors: Record<SensorId, SensorInfo>;
  harmonization: Harmonization;
  sources: string[];
  limitations: string[];
  cells: [west: number, south: number, modis: number[], viirs: number[]][];
}

/** Columnar recent detections, written by scripts/build-country.mjs. */
export interface RecentColumns {
  platforms: string[];
  lon: number[];
  lat: number[];
  acquired_utc: string[];
  platform: number[];
  confidence: number[]; // 1 nominal, 2 high
  frp: number[];
  daynight: number[]; // 1 day, 0 night
}

export interface Hotspot {
  lon: number;
  lat: number;
  acquired_utc: string;
  platform: string;
  confidence: string;
  frp: number;
  daynight: "D" | "N";
}

interface PlaceBase {
  id: string;
  label: string;
  bbox: BBox;
  summary: string;
  synthetic?: boolean;
}

/** A place with a gridded multi-year history: any drawn area inside it gets its own calendar. */
export interface GridPlace extends PlaceBase {
  kind: "grid";
  scope?: "region" | "country";
  base: string;
}

/** A region from the data contract (API or static export): fixed areas, weekly rows per platform. */
export interface WeeklyPlace extends PlaceBase {
  kind: "weekly";
  entry: RegionEntry;
}

export type Place = GridPlace | WeeklyPlace;

export interface LoadedGrid {
  place: GridPlace;
  grid: MonthlyGrid;
  recent: Hotspot[];
}

export interface LoadedWeekly {
  place: WeeklyPlace;
  metadata: Metadata;
  areas: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProperties>;
  weekly: WeeklyRow[];
  recent: Hotspot[] | null; // null: the region has no hotspot export
}

export type Loaded = LoadedGrid | LoadedWeekly;

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
  approximate: boolean; // derived from ISO weeks rather than daily records
  source: string;
  kind?: SeriesKind;
  provisionalFrom?: number; // month index where near-real-time (provisional) data begins
  baselineFrom?: number; // earlier complete years are shown but kept out of averages
  baselineNote?: string;
}
