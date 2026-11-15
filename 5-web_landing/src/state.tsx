// What the scenes share: the country list, the country on show and its record, the hotspots on the
// globe, and which scene holds the globe.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type CountryRecord, type Hotspot, loadPlaces, loadRecent, loadRecord, type Place } from "./data";
import type { Stage } from "./globe/draw";

// Every country's last 7 days light the globe. These load first, so the side facing the reader
// fills in before the rest of the world.
const FIRST = ["BRA", "ARG", "MEX", "USA", "COD", "AGO", "AUS", "IND", "IDN"];
const PARALLEL = 6; // requests in flight at once

interface Shared {
  places: Place[] | null; // null while loading or when the API is down
  place: Place | null;
  select: (id: string) => void;
  record: CountryRecord | null;
  failed: boolean;
  points: Hotspot[];
  stage: Stage;
  setStage: (stage: Stage) => void;
}

export const HERO: Stage = { center: null, x: 0.74, y: 0.52, scale: 0.4, dim: 1 };
const Context = createContext<Shared | null>(null);

export function useShared(): Shared {
  const value = useContext(Context);
  if (!value) throw new Error("useShared outside <SharedProvider>");
  return value;
}

export function SharedProvider({ children }: { children: ReactNode }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [id, setId] = useState("brazil");
  const [record, setRecord] = useState<CountryRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const [points, setPoints] = useState<Hotspot[]>([]);
  const [stage, setStage] = useState<Stage>(HERO);

  useEffect(() => {
    loadPlaces().then(setPlaces, () => setFailed(true));
  }, []);

  const place = useMemo(() => places?.find((p) => p.id === id) ?? places?.[0] ?? null, [places, id]);

  useEffect(() => {
    if (!place) return;
    let live = true;
    setRecord(null);
    setFailed(false);
    loadRecord(place).then(
      (r) => live && setRecord(r),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [place]);

  // The whole world, a few countries at a time. Points reach the globe in batches, so 235 answers
  // do not mean 235 renders.
  useEffect(() => {
    if (!places) return;
    let live = true;
    const each = window.innerWidth < 640 ? 150 : 400; // most points kept per country
    const first = (p: Place) => (FIRST.some((iso) => p.iso.includes(iso)) ? 0 : 1);
    const queue = [...places].sort((a, b) => first(a) - first(b));
    let pending: Hotspot[] = [];
    const flush = () => {
      if (!live || !pending.length) return;
      const more = pending;
      pending = [];
      setPoints((all) => all.concat(more));
    };
    const timer = window.setInterval(flush, 500);
    const worker = async () => {
      for (let p = queue.shift(); p && live; p = queue.shift()) {
        try {
          pending.push(...(await loadRecent(p, each)));
        } catch {
          // The globe is decoration: a missing file leaves that country dark.
        }
      }
    };
    void Promise.all(Array.from({ length: PARALLEL }, worker)).then(() => {
      window.clearInterval(timer);
      flush();
    });
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [places]);

  const value = useMemo<Shared>(
    () => ({ places, place, select: setId, record, failed, points, stage, setStage }),
    [places, place, record, failed, points, stage],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
