import { AtlasLink } from "../components/AtlasLink";
import { HERO, useShared } from "../state";
import { Rise, Scene, useNarrow } from "./Scene";

const day = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en", { day: "numeric", month: "long", timeZone: "UTC" });

export function Hero() {
  const { places, points } = useShared();
  const narrow = useNarrow();
  const last = places?.reduce((m, p) => (p.last_day > m ? p.last_day : m), "");
  return (
    <Scene stage={narrow ? { ...HERO, x: 0.5, y: 0.86, scale: 0.4, dim: 0.6 } : HERO}>
      <div className="max-w-2xl">
        <Rise>
          <p className="flex items-center gap-2.5 text-sm font-medium text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-heat-4 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-heat-4" />
            </span>
            {last ? `Live from NASA FIRMS. Last satellite day: ${day(last)}.` : "Live from NASA FIRMS."}
          </p>
        </Rise>
        <Rise delay={0.08}>
          <h1 className="mt-6 text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
            Every hotspot on Earth since 2000. <span className="heat-text">One record.</span>
          </h1>
        </Rise>
        <Rise delay={0.16}>
          <p className="mt-7 max-w-xl text-xl text-muted">
            Two generations of NASA satellite sensors, joined into a single monthly history for{" "}
            {places ? `${places.length} countries` : "every country"}.
          </p>
        </Rise>
        <Rise delay={0.24} className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
          <AtlasLink />
          <a href="#gap" className="link text-base">
            Why it took 26 years
          </a>
        </Rise>
        {points.length > 0 && (
          <Rise delay={0.4}>
            <p className="mt-14 text-sm text-muted">
              <span className="font-semibold tabular-nums text-heat-5">{points.length.toLocaleString("en")}</span> of
              this week&apos;s hotspots, from every country, are on the globe right now.
            </p>
          </Rise>
        )}
      </div>
    </Scene>
  );
}
