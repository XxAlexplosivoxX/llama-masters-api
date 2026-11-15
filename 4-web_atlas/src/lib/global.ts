// Global: no world file. The user clicks countries or draws an area; only the countries it touches
// are downloaded (their usual per-country files) and merged here into one Loaded.
import { loadOutline } from "./data";
import { areaKm2, bboxOf, bboxPolygon, contains } from "./geo";
import type { BBox, Loaded, MonthlyGrid, Place, SparseSeries } from "./types";
import { overlaps } from "./validate";

export const GLOBAL_ID = "global";

export function globalPlace(places: Place[]): Place {
  return {
    id: GLOBAL_ID,
    label: "Global",
    kind: "global",
    iso: [],
    bbox: [-170, -56, 180, 75],
    states: 0,
    first_month: places[0]?.first_month ?? "",
    last_day: places[0]?.last_day ?? "",
  };
}

type Ring = GeoJSON.Position[];

function inRing(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside an outer ring and outside its holes, in any polygon of the outline. */
export function inOutline(outline: GeoJSON.MultiPolygon, x: number, y: number): boolean {
  return outline.coordinates.some(([outer, ...holes]) => inRing(outer, x, y) && !holes.some((h) => inRing(h, x, y)));
}

function segmentsCross([ax, ay]: GeoJSON.Position, [bx, by]: GeoJSON.Position, [cx, cy]: GeoJSON.Position, [dx, dy]: GeoJSON.Position) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function intersects(polygon: GeoJSON.Polygon, outline: GeoJSON.MultiPolygon): boolean {
  const ring = polygon.coordinates[0];
  if (ring.some(([x, y]) => inOutline(outline, x, y))) return true;
  for (const [outer] of outline.coordinates) {
    if (outer.some(([x, y]) => contains(polygon, x, y))) return true;
    for (let i = 1; i < ring.length; i++)
      for (let j = 1; j < outer.length; j++) if (segmentsCross(ring[i - 1], ring[i], outer[j - 1], outer[j])) return true;
  }
  return false;
}

const countries = (places: Place[]) => places.filter((p) => p.kind === "country" && p.bbox);

/** The countries a drawn area touches: bounding boxes first, then the borders (a few KB each). */
export async function countriesIn(places: Place[], polygon: GeoJSON.Polygon): Promise<Place[]> {
  const box = bboxOf(polygon);
  const near = countries(places).filter((p) => overlaps(p.bbox, box));
  const borders = await Promise.all(near.map(loadOutline));
  // Without a border file only the bounding box is known: count it when its centre is in the area.
  return near.filter((p, i) =>
    borders[i] ? intersects(polygon, borders[i]!) : contains(polygon, (p.bbox[0] + p.bbox[2]) / 2, (p.bbox[1] + p.bbox[3]) / 2),
  );
}

/** The country under a clicked point, or null (sea, or a country without data). */
export async function countryAt(places: Place[], lon: number, lat: number): Promise<Place | null> {
  const hits = countries(places).filter((p) => lon >= p.bbox[0] && lon <= p.bbox[2] && lat >= p.bbox[1] && lat <= p.bbox[3]);
  const borders = await Promise.all(hits.map(loadOutline));
  return hits.find((_, i) => borders[i] && inOutline(borders[i]!, lon, lat)) ?? null;
}

/** From this many countries at once, warn that the map can slow down. */
const WARN_COUNTRIES = 3;
/** Or when the picked countries' history is heavy (a rough download in MB, never shown). */
const WARN_MB = 6;

/**
 * Whether loading these countries together may freeze the map for a while. The weight is guessed
 * from each border's area (about 3 KB per 1,000 km², at most ~3.5 MB a country, since the export
 * coarsens big countries' grids).
 */
export async function isHeavy(picked: Place[]): Promise<boolean> {
  if (picked.length >= WARN_COUNTRIES) return true;
  const sizes = await Promise.all(
    picked.map(async (p) => {
      const border = await loadOutline(p);
      const km2 = border
        ? border.coordinates.reduce((a, [outer]) => a + areaKm2({ type: "Polygon", coordinates: [outer] }), 0)
        : areaKm2(bboxPolygon(p.bbox));
      return Math.min(3.5, (km2 / 1000) * 0.003);
    }),
  );
  return sizes.reduce((a, b) => a + b, 0) > WARN_MB;
}

export const listLabel = (picked: Place[], max = 3) =>
  picked.length <= max
    ? picked.map((p) => p.label).join(", ")
    : `${picked
        .slice(0, max)
        .map((p) => p.label)
        .join(", ")} + ${picked.length - max} more`;

/** Two sparse [month, value, ...] series added month by month. */
function sum(a: Map<number, number>, b: Map<number, number>) {
  const out = new Map(a);
  b.forEach((v, k) => out.set(k, (out.get(k) ?? 0) + v));
  return out;
}
const toMap = (pairs: SparseSeries) => {
  const m = new Map<number, number>();
  for (let i = 0; i < pairs.length; i += 2) m.set(pairs[i], pairs[i + 1]);
  return m;
};
const toPairs = (m: Map<number, number>, keys = [...m.keys()].sort((x, y) => x - y)) =>
  keys.flatMap((k) => [k, m.get(k) ?? 0]);
/** Brightness temperatures of two cells for the same month, weighted by their hotspots (0 = none). */
function meanTemp(ta: Map<number, number>, wa: Map<number, number>, tb: Map<number, number>, wb: Map<number, number>) {
  const out = new Map<number, number>();
  for (const k of new Set([...ta.keys(), ...tb.keys()])) {
    const t1 = ta.get(k) ?? 0,
      t2 = tb.get(k) ?? 0;
    const w1 = t1 ? (wa.get(k) ?? 1) : 0,
      w2 = t2 ? (wb.get(k) ?? 1) : 0;
    out.set(k, w1 + w2 ? (t1 * w1 + t2 * w2) / (w1 + w2) : 0);
  }
  return out;
}

type Cell = MonthlyGrid["cells"][number];

/** A border cell exported by two countries: each counted its own hotspots, so they add up. */
function mergeCell(a: Cell, b: Cell): Cell {
  const [am, bm, av, bv] = [a[2], b[2], a[3], b[3]].map(toMap);
  const modis = sum(am, bm);
  const modisKeys = [...modis.keys()].sort((x, y) => x - y);
  return [
    a[0],
    a[1],
    toPairs(modis, modisKeys),
    toPairs(sum(av, bv)),
    toPairs(meanTemp(toMap(a[4]), am, toMap(b[4]), bm), modisKeys), // pair for pair with modis
    toPairs(meanTemp(toMap(a[5]), av, toMap(b[5]), bv)),
  ];
}

function mergeGrids(grids: MonthlyGrid[]): MonthlyGrid {
  const [first] = grids;
  if (grids.some((g) => g.months !== first.months || g.start_month !== first.start_month))
    throw new Error("These countries were exported on different days; reload the page and try again.");
  const at = new Map<string, number>();
  const cells: Cell[] = [];
  const degs: number[] = [];
  for (const g of grids)
    g.cells.forEach((c, i) => {
      const deg = g.cell_degs?.[i] ?? g.cell_deg;
      const key = `${c[0]},${c[1]},${deg}`;
      const j = at.get(key);
      if (j === undefined) {
        at.set(key, cells.length);
        cells.push(c);
        degs.push(deg);
      } else cells[j] = mergeCell(cells[j], c);
    });
  return {
    ...first,
    cell_deg: Math.min(...grids.map((g) => g.cell_deg)),
    cell_degs: degs,
    cells,
    partial: first.partial.map((p, m) => grids.some((g) => g.partial[m]) || p),
    provisional: first.provisional.map((p, m) => grids.some((g) => g.provisional[m]) || p),
  };
}

const unionBBox = (boxes: BBox[]): BBox => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

/** Several countries as one place: grids side by side, last 7 days together, all borders drawn. */
export function mergeLoaded(parts: Loaded[]): Loaded {
  const picked = parts.map((p) => p.place);
  const label = listLabel(picked);
  const polygons = parts.flatMap((p) => p.outline?.coordinates ?? []);
  return {
    place: { ...picked[0], id: GLOBAL_ID, kind: "global", label, bbox: unionBBox(picked.map((p) => p.bbox)) },
    grid: parts.length === 1 ? parts[0].grid : mergeGrids(parts.map((p) => p.grid)),
    monthly: parts[0].monthly,
    meta: { ...parts[0].meta, label },
    recent: parts.flatMap((p) => p.recent).sort((a, b) => (a.acquired_utc < b.acquired_utc ? -1 : 1)),
    outline: polygons.length ? { type: "MultiPolygon", coordinates: polygons } : null,
    parts,
  };
}

/** "0.1° cell", or "0.1–0.5° cell" when merged countries use different cell sizes. */
export function cellLabel(grid: MonthlyGrid): string {
  const degs = grid.cell_degs ?? [grid.cell_deg];
  const lo = Math.min(...degs),
    hi = Math.max(...degs);
  return lo === hi ? `${lo}° cell` : `${lo}–${hi}° cell`;
}
