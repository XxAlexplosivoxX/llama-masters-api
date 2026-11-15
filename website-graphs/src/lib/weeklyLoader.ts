import type { AreaProperties, Hotspot, Metadata, WeeklyPlace, WeeklyRow } from "../types";
import { fetchHotspots, usingApi } from "./shared";

const API = (import.meta.env.VITE_DATA_URL as string | undefined)?.replace(/\/$/, "") || "";

async function getJSON<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  if (!(response.headers.get("content-type") ?? "").includes("json")) throw new Error(`${url} is not JSON (the file is probably missing)`);
  return response.json() as Promise<T>;
}

export async function loadWeeklyCore(place: WeeklyPlace, signal: AbortSignal) {
  const base = `${usingApi() ? API : "./data/regions"}/${place.id}`;
  const [metadata, areas, weekly] = await Promise.all([
    getJSON<Metadata>(`${base}/metadata.json`, signal),
    getJSON<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, AreaProperties>>(`${base}/areas.geojson`, signal),
    getJSON<WeeklyRow[]>(`${base}/weekly_activity.json`, signal),
  ]);
  return { place, metadata, areas, weekly, recent: null };
}

function fromGeoJSON(fc: GeoJSON.FeatureCollection): Hotspot[] {
  return fc.features.flatMap((feature) => {
    if (feature.geometry.type !== "Point") return [];
    const properties = feature.properties ?? {};
    const [lon, lat] = feature.geometry.coordinates;
    return [{ lon, lat, acquired_utc: properties.acquired_utc, platform: properties.platform, confidence: properties.confidence,
      frp: properties.frp, daynight: properties.daynight } as Hotspot];
  });
}

export async function loadWeeklyRecent(place: WeeklyPlace, signal: AbortSignal, areaId?: string | null) {
  if (!areaId || !usingApi()) {
    const result = await fetchHotspots(place, null, signal);
    return result ?? { points: null, truncated: false };
  }
  const query = new URLSearchParams({ limit: "200000", area_id: areaId });
  const response = await fetch(`${API}/v1/regions/${place.id}/hotspots?${query}`, { signal });
  if (response.status === 404) return { points: null, truncated: false };
  if (!response.ok) throw new Error(`hotspots answered HTTP ${response.status}`);
  return { points: fromGeoJSON(await response.json()), truncated: response.headers.get("X-Truncated") === "true" };
}
