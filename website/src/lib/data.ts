import type {
  AreaProperties, BBox, GridPlace, Hotspot, Loaded, Metadata, MonthlyGrid, Place, RecentColumns, RegionEntry,
  WeeklyPlace, WeeklyRow,
} from "./types";

/** llama-masters-api base URL; without it, contract regions come from public/data/regions. */
const API = (import.meta.env.VITE_DATA_URL as string | undefined)?.replace(/\/$/, "") || "";
const STATIC_REGIONS = "./data/regions";

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  if (!(response.headers.get("content-type") ?? "").includes("json")) {
    throw new Error(`${url} is not JSON (the file is probably missing)`);
  }
  return response.json() as Promise<T>;
}

interface PlaceIndexEntry {
  id: string;
  label: string;
  bbox: BBox;
  base: string;
  history: Record<string, { first_source_month: string; last_source_day: string }>;
}

/** Countries built by scripts/build-country.mjs (public/data/places.json). */
async function loadGridPlaces(): Promise<GridPlace[]> {
  try {
    const index = await getJSON<PlaceIndexEntry[]>("./data/places.json");
    return index.map((p) => ({
      id: p.id, label: p.label, kind: "grid", base: p.base, bbox: p.bbox,
      summary: `MODIS since ${p.history.MODIS.first_source_month.slice(0, 4)}, VIIRS since ${p.history.VIIRS.first_source_month.slice(0, 4)}`,
    }));
  } catch {
    return [];
  }
}

/** Shown in the switcher as a preview of where the pipeline goes next; they have no data yet. */
export const COMING_SOON: { label: string; note: string }[] = [
  { label: "Peru", note: "Andes and Amazon" },
  { label: "Venezuela", note: "Llanos savanna" },
  { label: "Mexico", note: "Yucatán and Sierra Madre" },
  { label: "Australia", note: "Northern savanna" },
  { label: "Indonesia", note: "Peatland fires" },
];

/** Where contract regions are read from, and whether it is the live API. */
let regionBase = API || STATIC_REGIONS;
export const usingApi = () => regionBase === API && API !== "";

async function loadRegionIndex(): Promise<RegionEntry[]> {
  if (API) {
    try {
      return await getJSON<RegionEntry[]>(`${API}/index.json`, AbortSignal.timeout(4000));
    } catch (error) {
      console.warn(`API unavailable at ${API}, using static exports`, error);
    }
  }
  regionBase = STATIC_REGIONS;
  try {
    return await getJSON<RegionEntry[]>(`${STATIC_REGIONS}/index.json`);
  } catch {
    return [];
  }
}

export async function loadPlaces(): Promise<Place[]> {
  const entries = await loadRegionIndex();
  const weekly: WeeklyPlace[] = entries.map((entry) => ({
    id: entry.name,
    label: titleCase(entry.name),
    kind: "weekly",
    entry,
    bbox: [-170, -56, -30, 84],
    summary: `Weekly detections by satellite, ${entry.start} to ${entry.end}`,
    synthetic: entry.name.includes("tiny"),
  }));
  return [...(await loadGridPlaces()), ...weekly];
}

function titleCase(name: string): string {
  return name.replace(/-(\d{4})-(\d{2})$/, " $1-$2").replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function fromColumns(c: RecentColumns): Hotspot[] {
  return c.lon.map((lon, i) => ({
    lon,
    lat: c.lat[i],
    acquired_utc: c.acquired_utc[i],
    platform: c.platforms[c.platform[i]],
    confidence: c.confidence[i] === 2 ? "high" : "nominal",
    frp: c.frp[i],
    daynight: c.daynight[i] ? "D" : "N",
  }));
}

function fromGeoJSON(fc: GeoJSON.FeatureCollection): Hotspot[] {
  return fc.features.flatMap((f) => {
    if (f.geometry.type !== "Point") return [];
    const p = f.properties ?? {};
    const [lon, lat] = f.geometry.coordinates;
    return [{ lon, lat, acquired_utc: p.acquired_utc, platform: p.platform, confidence: p.confidence, frp: p.frp, daynight: p.daynight }];
  });
}

export async function loadPlace(place: Place, signal?: AbortSignal): Promise<Loaded> {
  if (place.kind === "grid") {
    const [grid, columns] = await Promise.all([
      getJSON<MonthlyGrid>(`${place.base}/monthly_grid.json`, signal),
      getJSON<RecentColumns>(`${place.base}/recent_hotspots.json`, signal).catch(() => null),
    ]);
    return { place, grid, recent: columns ? fromColumns(columns) : [] };
  }
  const base = `${regionBase}/${place.id}`;
  const [metadata, areas, weekly] = await Promise.all([
    getJSON<Metadata>(`${base}/metadata.json`, signal),
    getJSON<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProperties>>(`${base}/areas.geojson`, signal),
    getJSON<WeeklyRow[]>(`${base}/weekly_activity.json`, signal),
  ]);
  const recent = await fetchHotspots(place, null, signal).then((r) => r?.points ?? null).catch(() => null);
  return { place, metadata, areas, weekly, recent };
}

/**
 * Contract-region hotspots. With the API, the server filters by bbox and caps the count
 * (X-Truncated says more matched); static exports are git-ignored and may be absent.
 */
export async function fetchHotspots(place: WeeklyPlace, bbox: BBox | null, signal?: AbortSignal):
  Promise<{ points: Hotspot[]; truncated: boolean } | null> {
  if (usingApi()) {
    const query = new URLSearchParams({ limit: "200000" });
    if (bbox) query.set("bbox", bbox.map((v) => v.toFixed(4)).join(","));
    const response = await fetch(`${API}/v1/regions/${place.id}/hotspots?${query}`, { signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`hotspots answered HTTP ${response.status}`);
    return { points: fromGeoJSON(await response.json()), truncated: response.headers.get("X-Truncated") === "true" };
  }
  try {
    const fc = await getJSON<GeoJSON.FeatureCollection>(`${regionBase}/${place.id}/hotspots.geojson`, signal);
    return { points: fromGeoJSON(fc), truncated: false };
  } catch {
    return null;
  }
}
