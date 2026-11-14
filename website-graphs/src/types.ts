// Contract shapes and monthly-grid types come straight from the website: one source of truth.
export type {
  AreaProperties, GridPlace, Harmonization, Hotspot, Loaded, LoadedGrid, LoadedWeekly, Metadata, MonthlyGrid,
  MonthlySeries, Place, RecentColumns, RegionEntry, Scores, SensorId, SensorInfo, SeriesKind, WeeklyPlace, WeeklyRow,
} from "../../website/src/lib/types";

export type Platform = "Terra" | "Aqua" | "S-NPP" | "NOAA-20" | "NOAA-21";
export const PLATFORMS: Platform[] = ["Terra", "Aqua", "S-NPP", "NOAA-20", "NOAA-21"];
export const SATELLITE_ORDER: string[] = ["NOAA-20", "NOAA-21", "S-NPP", "Aqua", "Terra"];

export const INSTRUMENT: Record<Platform, "MODIS" | "VIIRS"> = {
  Terra: "MODIS", Aqua: "MODIS", "S-NPP": "VIIRS", "NOAA-20": "VIIRS", "NOAA-21": "VIIRS",
};
export const RESOLUTION: Record<Platform, string> = {
  Terra: "1 km", Aqua: "1 km", "S-NPP": "375 m", "NOAA-20": "375 m", "NOAA-21": "375 m",
};

/** One point-level record from an uploaded FIRMS CSV. */
export interface CsvPoint {
  date: string; // YYYY-MM-DD UTC
  platform: Platform;
  frp: number | null;
  daynight: "D" | "N" | null;
  lon?: number; // present for gridded places' recent hotspots, used for the per-cell conversion
  lat?: number;
}
