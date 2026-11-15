import { AtlasLink } from "../components/AtlasLink";
import { useShared } from "../state";
import { Rise, Scene } from "./Scene";

export function Open() {
  const { places } = useShared();
  return (
    <Scene stage={{ center: null, x: 0.5, y: 0.95, scale: 0.6, dim: 0.6 }} className="text-center">
      <Rise>
        <h2 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
          The atlas is <span className="heat-text">live.</span>
        </h2>
      </Rise>
      <Rise delay={0.1}>
        <p className="mx-auto mt-7 max-w-xl text-xl text-muted">
          Pick a country or draw your own area. Play the months. Compare today with the record. Take the CSV.
        </p>
      </Rise>
      <Rise delay={0.2} className="mt-10 flex justify-center">
        <AtlasLink />
      </Rise>
      <Rise delay={0.3}>
        <p className="mx-auto mt-14 flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted">
          <span>NASA FIRMS data</span>
          <span>5 satellites</span>
          {places && <span>{places.length} countries</span>}
          <a className="link" href="/v1/places">
            Open API
          </a>
        </p>
      </Rise>
    </Scene>
  );
}
