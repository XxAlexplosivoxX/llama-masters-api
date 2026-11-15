// The globe, drawn on a 2D canvas: an orthographic projection of the land outline with the last
// 7 days of hotspots on top. No map library, so the page stays light and the look is ours.
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import type { Hotspot } from "../data";

/** What the globe should look like for the scene on screen. */
export interface Stage {
  center: [number, number] | null; // lon, lat to face; null = keep spinning
  x: number; // globe centre, as a share of the viewport width
  y: number; // and of its height
  scale: number; // radius, as a share of the smaller viewport side
  dim: number; // opacity, 0..1
}

export interface View {
  lon: number; // the longitude facing the viewer
  lat: number;
  x: number;
  y: number;
  radius: number;
  dim: number;
}

const RAD = Math.PI / 180;

/** Whether a point is on the half of the globe that faces the viewer. */
export function visible(lon: number, lat: number, centerLon: number, centerLat: number): boolean {
  const cos =
    Math.sin(lat * RAD) * Math.sin(centerLat * RAD) +
    Math.cos(lat * RAD) * Math.cos(centerLat * RAD) * Math.cos((lon - centerLon) * RAD);
  return cos > 0;
}

/** The shortest signed turn from `from` to `to`, in degrees (-180..180]. */
export function turn(from: number, to: number): number {
  const d = (((to - from) % 360) + 540) % 360;
  return d - 180 === -180 ? 180 : d - 180;
}

/** One step of easing toward the stage: a fixed share of the remaining distance per frame. */
export function ease(view: View, target: View, k: number): View {
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    lon: view.lon + turn(view.lon, target.lon) * k,
    lat: mix(view.lat, target.lat),
    x: mix(view.x, target.x),
    y: mix(view.y, target.y),
    radius: mix(view.radius, target.radius),
    dim: mix(view.dim, target.dim),
  };
}

// Hotspots twinkle in groups: each point belongs to one of these, by its place in the list, and each
// group brightens and dims on its own rhythm. Neighbours fall in different groups, so the planet
// shimmers at random instead of blinking as one.
const GROUPS = 12;

/** The brightness of every group at a moment, each 0..1. `null` time (no motion) gives a steady 0.5. */
export function twinkle(seconds: number | null): number[] {
  return Array.from({ length: GROUPS }, (_, g) => {
    if (seconds === null) return 0.5;
    const speed = 0.9 + ((g * 7) % GROUPS) * 0.11; // radians per second, different for each group
    const wave = 0.5 + 0.5 * Math.sin(seconds * speed + g * 2.4);
    return wave * wave; // long quiet stretches, short bright ones
  });
}

const graticule = geoGraticule10();
const SPHERE: GeoPermissibleObjects = { type: "Sphere" };

export function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: View,
  land: GeoPermissibleObjects | null,
  points: Hotspot[],
  light: number[], // the brightness of each group of hotspots (see `twinkle`)
): void {
  ctx.clearRect(0, 0, width, height);
  if (view.dim <= 0.01 || view.radius <= 1) return;
  const cx = view.x * width;
  const cy = view.y * height;
  const r = view.radius;
  const projection = geoOrthographic().scale(r).translate([cx, cy]).rotate([-view.lon, -view.lat]).clipAngle(90);
  const path = geoPath(projection, ctx);
  ctx.globalAlpha = view.dim;

  // The glow behind the planet, in the heat colours.
  const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.35);
  halo.addColorStop(0, "rgba(241, 96, 93, 0.2)");
  halo.addColorStop(0.5, "rgba(183, 55, 121, 0.07)");
  halo.addColorStop(1, "rgba(11, 15, 26, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - r * 1.4, cy - r * 1.4, r * 2.8, r * 2.8);

  const ocean = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  ocean.addColorStop(0, "#182036");
  ocean.addColorStop(1, "#0c111e");
  ctx.beginPath();
  path(SPHERE);
  ctx.fillStyle = ocean;
  ctx.fill();

  ctx.beginPath();
  path(graticule);
  ctx.strokeStyle = "rgba(154, 166, 192, 0.07)";
  ctx.lineWidth = 1;
  ctx.stroke();

  if (land) {
    ctx.beginPath();
    path(land);
    ctx.fillStyle = "#1f2942";
    ctx.fill();
    ctx.strokeStyle = "rgba(154, 166, 192, 0.28)";
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }

  // Hotspots add up where they overlap, so dense activity reads brighter.
  ctx.globalCompositeOperation = "lighter";
  const size = Math.max(1.1, r / 260);
  // Tens of thousands of points, so the projection is plain trigonometry (no clipping stream) and
  // the marks are squares, one fill style per group.
  const l0 = view.lon * RAD;
  const sin0 = Math.sin(view.lat * RAD);
  const cos0 = Math.cos(view.lat * RAD);
  const seen: number[][] = Array.from({ length: GROUPS }, () => []);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dl = p.lon * RAD - l0;
    const sin = Math.sin(p.lat * RAD);
    const cos = Math.cos(p.lat * RAD);
    const cosdl = Math.cos(dl);
    if (sin0 * sin + cos0 * cos * cosdl <= 0.03) continue; // behind the planet, or on its very edge
    // A multiplicative hash, so points that sit together in the list land in different groups.
    seen[((i * 2654435761) >>> 0) % GROUPS].push(
      cx + r * cos * Math.sin(dl),
      cy - r * (cos0 * sin - sin0 * cos * cosdl),
    );
  }
  for (let g = 0; g < GROUPS; g++) {
    const xy = seen[g];
    const lit = light[g];
    const glow = size * (3 + 2.4 * lit);
    ctx.fillStyle = `rgba(241, 96, 93, ${0.05 + 0.09 * lit})`;
    for (let i = 0; i < xy.length; i += 2) ctx.fillRect(xy[i] - glow / 2, xy[i + 1] - glow / 2, glow, glow);
    const core = size * (1.1 + 0.5 * lit);
    ctx.fillStyle = `rgba(254, 175, 119, ${0.4 + 0.5 * lit})`;
    for (let i = 0; i < xy.length; i += 2) ctx.fillRect(xy[i] - core / 2, xy[i + 1] - core / 2, core, core);
  }
  ctx.globalCompositeOperation = "source-over";

  ctx.beginPath();
  path(SPHERE);
  ctx.strokeStyle = "rgba(254, 175, 119, 0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
