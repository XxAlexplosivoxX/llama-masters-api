import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Download,
  Flame,
  Layers,
  MapPinned,
  Radar,
  Satellite,
  Sigma,
  TrendingUp,
} from "lucide-react";
import atlasShot from "./assets/atlas.webp";
import { Chart } from "./Chart";
import { loadPlaces, loadRecord, type Place, type Record_ } from "./data";

const ATLAS = "/atlas/";

export function App() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <Header />
      <main>
        <Hero />
        <Problem />
        <Method />
        <Features />
        <Data />
      </main>
      <Footer />
    </div>
  );
}

function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="9" className="fill-heat-4" />
      <circle cx="16" cy="16" r="4.5" className="fill-heat-6" />
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          x1="16"
          y1="2"
          x2="16"
          y2="5"
          className="stroke-heat-5"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${i * 45} 16 16)`}
        />
      ))}
    </svg>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <Mark className="h-7 w-7" />
          tonalli
        </a>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <a href="#method" className="hidden rounded-lg px-3 py-2 text-muted hover:text-text sm:block">
            Method
          </a>
          <a href="#atlas" className="hidden rounded-lg px-3 py-2 text-muted hover:text-text sm:block">
            Atlas
          </a>
          <a href="#data" className="hidden rounded-lg px-3 py-2 text-muted hover:text-text sm:block">
            Data
          </a>
          <a
            href={ATLAS}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 font-semibold text-white hover:bg-accent/90"
          >
            Open atlas <ArrowRight className="h-4 w-4" />
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(241,96,93,0.18),transparent_70%)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
        <p className="text-sm font-medium text-heat-5">NASA Space Apps Challenge 2026 · MODIS and VIIRS Hot Spots</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
          Twenty-six years of fire, <span className="heat-text">on one scale.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Tonalli joins two generations of NASA fire satellites into one monthly hotspot record for every country, from
          November 2000 to last week. See when and where land burns, which years were worst, and whether this month is
          unusual.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={ATLAS}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-white hover:bg-accent/90"
          >
            Open the atlas <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#method"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-3 font-semibold hover:bg-surface"
          >
            How it works
          </a>
        </div>

        <a
          href={ATLAS}
          className="group mt-14 block overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
          aria-label="Open the atlas: Brazil's harmonized hotspot map with its 2026 calendar"
        >
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-surface-2" />
            <span className="h-2.5 w-2.5 rounded-full bg-surface-2" />
            <span className="h-2.5 w-2.5 rounded-full bg-surface-2" />
            <span className="ml-3 truncate text-xs text-muted">tonalli.earth/atlas</span>
          </div>
          <img
            src={atlasShot}
            width={1440}
            height={860}
            alt="The atlas showing Brazil: 0.5° cells coloured by hotspots since 2000, and a 2026 calendar of monthly fire activity"
            className="block h-auto w-full transition duration-500 group-hover:scale-[1.01]"
          />
        </a>
        <Stats />
      </div>
    </section>
  );
}

function Stats() {
  const [places, setPlaces] = useState<Place[] | null>(null);
  useEffect(() => {
    loadPlaces()
      .then(setPlaces)
      .catch(() => setPlaces(null));
  }, []);
  const last = places?.reduce((m, p) => (p.last_day > m ? p.last_day : m), "");
  const items = [
    { value: "2000 → today", label: "Monthly record, every month on the VIIRS scale" },
    { value: places ? String(places.length) : "235", label: "Countries, each with its own calendar" },
    { value: "5", label: "Satellites: Terra and Aqua (MODIS), S-NPP, NOAA-20 and NOAA-21 (VIIRS)" },
    {
      value: last
        ? new Date(last + "T00:00:00Z").toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" })
        : "Daily",
      label: "Latest day of hotspots in the last-7-days view",
    },
  ];
  return (
    <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="bg-bg p-5">
          <dt className="sr-only">{s.label}</dt>
          <dd className="m-0 text-2xl font-bold tabular-nums sm:text-3xl">{s.value}</dd>
          <dd className="m-0 mt-1 text-sm text-muted">{s.label}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
  lead,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-heat-5">{eyebrow}</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        {lead && <p className="mt-4 max-w-2xl text-lg text-muted">{lead}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Problem() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [id, setId] = useState("brazil");
  const [record, setRecord] = useState<Record_ | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadPlaces()
      .then((p) => setPlaces(p.filter((x) => x.kind === "country").sort((a, b) => a.label.localeCompare(b.label))))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    const place = places.find((p) => p.id === id);
    if (!place) return;
    let live = true;
    setRecord(null);
    loadRecord(place)
      .then((r) => live && setRecord(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [places, id]);

  const label = places.find((p) => p.id === id)?.label ?? "Brazil";
  return (
    <Section
      id="method"
      eyebrow="The problem"
      title="Two satellite records that don't agree"
      lead="MODIS has watched fires since 2000 with 1 km pixels. VIIRS took over from 2012 with 375 m pixels and sees several times more hotspots for the same fires. Put the raw records side by side and 2012 looks like the year the world caught fire."
    >
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="m-0 text-lg font-semibold">Hotspots per year in {label}</h3>
          <label className="flex items-center gap-2 text-sm text-muted">
            Country
            <select
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="max-w-48 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5"
            >
              {places.length === 0 && <option value="brazil">Brazil</option>}
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {record ? (
          <>
            <Chart data={record} />
            {record.wape !== null && (
              <p className="mt-4 text-sm text-muted">
                Hiding one year at a time and predicting it back, the reconstruction for {label} is off by{" "}
                <span className="font-semibold text-text">{(record.wape * 100).toFixed(1)}%</span> of the monthly
                hotspots on average.
              </p>
            )}
          </>
        ) : (
          <div className="grid h-[300px] place-items-center text-sm text-muted">
            {failed ? "The data could not be loaded right now." : "Loading the record…"}
          </div>
        )}
      </div>
    </Section>
  );
}

const STEPS = [
  {
    icon: Satellite,
    title: "VIIRS where it exists",
    body: "From 2012 every month uses VIIRS directly, on the NOAA-20 scale. S-NPP and NOAA-21 are scaled to it and never added together, so a month is never counted twice.",
  },
  {
    icon: Layers,
    title: "MODIS rebuilt on the VIIRS scale",
    body: "Before 2012 each month is reconstructed from MODIS with a ratio learned for every 0.5° cell and calendar month, pulled toward country and world values where data are thin.",
  },
  {
    icon: Sigma,
    title: "Tested, not assumed",
    body: "For every country and state we hide one year, predict it, and score the error. The best model wins, and its errors give the 10–90% band you see on every reconstructed month.",
  },
];

function Method() {
  return (
    <Section
      eyebrow="The method"
      title="One record, so the sensor no longer matters"
      lead="Tonalli puts everything on the newer, sharper VIIRS scale and rebuilds the MODIS years to match, cell by cell."
    >
      <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-heat-5">
                <s.icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-muted">Step {i + 1}</span>
            </div>
            <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Burning calendar",
    body: "Twelve months per year, coloured by hotspots. Hover to preview a month on the map, click to pin it.",
  },
  {
    icon: MapPinned,
    title: "Any area",
    body: "Pick a country or draw your own area on the map; the calendar and charts follow your selection.",
  },
  {
    icon: TrendingUp,
    title: "Anomalies",
    body: "Each month against its multi-year mean and median, so an unusual season stands out at once.",
  },
  {
    icon: Flame,
    title: "Fire temperature",
    body: "Mean brightness temperature per cell, harmonized too, with faint cells where few fires burned.",
  },
  {
    icon: Radar,
    title: "Last 7 days",
    body: "The newest hotspots as points, by sensor, to set this week against the record.",
  },
  {
    icon: Download,
    title: "CSV and open API",
    body: "Download what you are looking at, or read the same monthly files straight from the API.",
  },
];

function Features() {
  return (
    <Section
      id="atlas"
      eyebrow="The atlas"
      title="Built for the people who respond to fire"
      lead="Emergency managers, land managers and scientists can see a region's fire history at a glance: which months burn, which years were worst, and how now compares."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border border-border bg-surface p-6">
            <f.icon className="h-5 w-5 text-heat-5" />
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-muted">{f.body}</p>
          </div>
        ))}
      </div>
      <a
        href={ATLAS}
        className="mt-10 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-white hover:bg-accent/90"
      >
        Open the atlas <ArrowRight className="h-4 w-4" />
      </a>
    </Section>
  );
}

function Data() {
  return (
    <Section id="data" eyebrow="Data" title="Where the numbers come from">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-4 text-muted">
          <p className="m-0">
            Active fire detections from{" "}
            <a
              className="text-text underline decoration-border underline-offset-4 hover:decoration-text"
              href="https://firms.modaps.eosdis.nasa.gov/"
            >
              NASA FIRMS
            </a>
            : MODIS on Terra and Aqua, and VIIRS on S-NPP, NOAA-20 and NOAA-21. The full archives are cleaned of static
            sources such as gas flares and volcanoes, counted per cell and month, and refreshed with the latest days.
          </p>
          <p className="m-0">
            Brightness temperature is for the whole satellite pixel, not the flame, so it reads about 35–75 °C.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="m-0 text-base font-semibold">Open API</h3>
          <p className="mt-2 text-sm text-muted">The same files the atlas reads, as JSON.</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-bg p-4 text-xs leading-relaxed text-text">
            <code>{`GET /v1/places
GET /v1/places/brazil/monthly
GET /v1/places/brazil/grid
GET /v1/places/brazil/recent`}</code>
          </pre>
          <a
            href="/v1/places"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            Try /v1/places <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <Mark className="h-5 w-5" />
          <span>
            <span className="font-semibold text-text">tonalli</span>: in Nahuatl, the warmth of the sun.
          </span>
        </div>
        <p className="m-0">
          Made by team llama-masters for the NASA Space Apps Challenge 2026. Not an official NASA product.
        </p>
      </div>
    </footer>
  );
}
