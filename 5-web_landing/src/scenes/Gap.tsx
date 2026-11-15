import { useEffect, useMemo, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { jump } from "../data";
import { useShared } from "../state";
import { Rise, Scene, useNarrow } from "./Scene";

/** A number that counts up from `from` the first time it is seen. */
function Count({ from, to, className }: { from: number; to: number; className: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const still = useReducedMotion();
  const [value, setValue] = useState(still ? to : from);
  useEffect(() => {
    if (!seen || still) return setValue(still ? to : from);
    const run = animate(from, to, { duration: 2.2, delay: 0.5, ease: [0.22, 1, 0.36, 1], onUpdate: setValue });
    return () => run.stop();
  }, [seen, still, from, to]);
  return (
    <span ref={ref} className={className}>
      {Math.round(value).toLocaleString("en")}
    </span>
  );
}

export function Gap() {
  const { record, place } = useShared();
  const narrow = useNarrow();
  const j = useMemo(() => (record ? jump(record) : null), [record]);
  const center: [number, number] = place
    ? [(place.bbox[0] + place.bbox[2]) / 2, (place.bbox[1] + place.bbox[3]) / 2]
    : [-58, -15];
  return (
    <Scene
      id="gap"
      stage={
        narrow ? { center, x: 0.5, y: 0.16, scale: 0.42, dim: 0.3 } : { center, x: 0.25, y: 0.52, scale: 0.4, dim: 1 }
      }
    >
      <div className="ml-auto max-w-xl">
        <Rise>
          <h2 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Same heat.
            <br />
            Different counts.
          </h2>
        </Rise>
        <Rise delay={0.1}>
          <p className="mt-6 text-xl text-muted">
            MODIS watches the planet in 1 km pixels. VIIRS, its successor, sees 375 m. The sharper eye finds more.
          </p>
        </Rise>
        {j && record && (
          <Rise delay={0.2}>
            <dl key={record.id} className="mt-12 grid grid-cols-2 gap-8 border-t border-border pt-8">
              <div>
                <dt className="text-sm font-semibold text-modis">MODIS</dt>
                <dd className="m-0 mt-2 text-3xl font-bold tabular-nums sm:text-5xl">
                  {Math.round(j.modis).toLocaleString("en")}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-viirs">VIIRS</dt>
                <dd className="m-0 mt-2 text-3xl font-bold tabular-nums sm:text-5xl">
                  <Count from={j.modis} to={j.viirs} className="text-viirs" />
                </dd>
              </div>
            </dl>
            <p className="mt-6 text-muted">
              {record.label}, {j.year}. One year, one country,{" "}
              <span className="font-semibold text-text">{j.times.toFixed(1)} times</span> the hotspots. Stitch the raw
              records together and the world seems to light up in 2012.
            </p>
          </Rise>
        )}
      </div>
    </Scene>
  );
}
