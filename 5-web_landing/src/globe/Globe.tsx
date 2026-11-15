import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type { GeoPermissibleObjects } from "d3-geo";
import type { Hotspot } from "../data";
import { draw, ease, type Stage, type View, twinkle } from "./draw";

const SPIN = 4; // degrees per second while no scene holds the globe
const SCROLL = 0.06; // extra degrees per pixel scrolled: the planet turns as the page moves

/** A fixed canvas behind the page. It eases toward `stage`, and spins when the stage has no centre. */
export function Globe({ stage, points }: { stage: Stage; points: Hotspot[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef(stage);
  const dots = useRef(points);
  const still = useReducedMotion() ?? false;
  const repaint = useRef(() => {});
  target.current = stage;
  dots.current = points;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    let land: GeoPermissibleObjects | null = null;
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let spin = -55; // start over the Atlantic, the Americas and Africa in view
    let view: View | null = null;
    let live = true;

    // The outline is a separate chunk: the text paints first, the planet fills in after.
    void Promise.all([import("topojson-client"), import("world-atlas/land-110m.json")]).then(([topo, world]) => {
      if (!live) return;
      const data = world.default as unknown as Parameters<typeof topo.feature>[0];
      land = topo.feature(data, data.objects.land) as GeoPermissibleObjects;
      if (still) paint(performance.now());
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (still) paint(performance.now());
    };

    const goal = (): View => {
      const s = target.current;
      return {
        lon: s.center ? s.center[0] : spin + window.scrollY * SCROLL,
        lat: s.center ? s.center[1] : 12,
        x: s.x,
        y: s.y,
        radius: s.scale * Math.min(width, height),
        dim: s.dim,
      };
    };

    function paint(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (!still) spin += SPIN * dt;
      const g = goal();
      view = view && !still ? ease(view, g, 0.07) : g;
      draw(ctx!, width, height, view, land, dots.current, twinkle(still ? null : now / 1000));
    }

    const loop = (now: number) => {
      paint(now);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      if (still) paint(performance.now());
      else if (!document.hidden) frame = requestAnimationFrame(loop);
    };

    repaint.current = start;
    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", start);
    // Without motion there is no loop, so scenes and data repaint on scroll instead.
    if (still) window.addEventListener("scroll", start, { passive: true });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", start);
      window.removeEventListener("scroll", start);
    };
  }, [still]);

  // Without motion nothing redraws by itself: a new scene or new points ask for one frame.
  useEffect(() => {
    if (still) repaint.current();
  }, [still, stage, points]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
