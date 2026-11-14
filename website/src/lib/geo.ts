import type { BBox } from "./types";

export function bboxOf(geometry: GeoJSON.Geometry): BBox {
  let west = 180, south = 90, east = -180, north = -90;
  const visit = (coords: unknown): void => {
    if (typeof (coords as number[])[0] === "number") {
      const [x, y] = coords as number[];
      west = Math.min(west, x); east = Math.max(east, x); south = Math.min(south, y); north = Math.max(north, y);
    } else (coords as unknown[]).forEach(visit);
  };
  if ("coordinates" in geometry) visit(geometry.coordinates);
  return [west, south, east, north];
}

export function bboxPolygon([w, s, e, n]: BBox): GeoJSON.Polygon {
  return { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

/** Square of side 2 × radius around a point, in degrees corrected for latitude. */
export function squareAround(lat: number, lon: number, radiusKm: number): GeoJSON.Polygon {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return bboxPolygon([lon - dLon, lat - dLat, lon + dLon, lat + dLat]);
}

/** Even-odd ray casting on the outer ring; holes are ignored (drawn shapes have none). */
export function contains(polygon: GeoJSON.Polygon, lon: number, lat: number): boolean {
  const ring = polygon.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Approximate area of a lon/lat polygon in km² (spherical excess on a small-area projection). */
export function areaKm2(polygon: GeoJSON.Polygon): number {
  const ring = polygon.coordinates[0];
  const R = 6371;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += ((x2 - x1) * Math.PI / 180) * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  return Math.abs((sum * R * R) / 2);
}
