import { AnimatePresence, motion } from "motion/react";
import { HEAT, HEAT_ZERO } from "../lib/color";
import { fmt } from "../lib/format";
import type { Explorer } from "../state";
import { Anomalies } from "./Anomalies";
import { Calendar } from "./Calendar";
import { DateRange } from "./DateRange";
import { SensorCompare, SensorSwitch } from "./Sensors";
import { RecentBySatellite } from "./Recent";
import { Export } from "./Export";
import { KeyNumbers } from "./KeyNumbers";

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/70 pt-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      {[56, 64, 300, 140].map((h, i) => (
        <div key={i} className="animate-pulse rounded-lg bg-surface-2/70" style={{ height: h, animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}

export function Panel({ explorer, showingRecent, onShowRecent }: { explorer: Explorer; showingRecent: boolean; onShowRecent: () => void }) {
  const { status, loaded, place, series, stats, range, shape, focus, setFocusYear, hoverMonth, setHoverMonth } = explorer;
  const waveKey = `${place?.id}-${shape?.label ?? "all"}-${explorer.areaId}-${explorer.platform}`;

  return (
    <div className="space-y-5 px-5 pb-8 pt-1 lg:pt-5">
      <header>
        <p className="text-sm text-muted">Fire activity in</p>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.h1
            key={explorer.selectionLabel}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="text-xl font-semibold leading-tight"
          >
            {explorer.selectionLabel || "…"}
          </motion.h1>
        </AnimatePresence>
        {loaded && "areas" in loaded && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted">Area
              <select className="field" value={explorer.areaId} onChange={(e) => explorer.setAreaId(e.target.value)}>
                {loaded.areas.features.map((f) => <option key={f.properties.area_id} value={f.properties.area_id}>{f.properties.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted">Satellite
              <select className="field" value={explorer.platform} onChange={(e) => explorer.setPlatform(e.target.value)}>
                {loaded.place.entry.platforms.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
        )}
        {place?.synthetic && (
          <p className="mt-2 rounded-md bg-nasa-red/15 px-2 py-1 text-xs text-[#ff9d8f]">Synthetic sample, not real observations.</p>
        )}
      </header>

      {status.kind === "loading" && <Skeleton />}
      {status.kind === "error" && (
        <p className="rounded-lg border border-nasa-red/50 bg-nasa-red/10 p-4 text-sm" role="alert">{status.message}</p>
      )}

      {status.kind === "ready" && !series && (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted" role="status">
          {loaded && "grid" in loaded
            ? <>No history inside this area. The history grid has cells of {loaded.grid.cell_deg}° (about 55 km) inside {loaded.place.label}: draw a larger area there, or go back to all of {loaded.place.label}.</>
            : <>This area has no rows for {explorer.platform}. Pick another satellite.</>}
        </p>
      )}

      {status.kind === "ready" && series && stats && range && (
        <>
          {loaded && "grid" in loaded && <SensorSwitch explorer={explorer} grid={loaded.grid} />}

          {explorer.seriesRange && (
            <DateRange startYear={series.startYear} bounds={explorer.seriesRange} range={range}
              baselineFrom={series.baselineFrom} focusYear={focus} onRange={explorer.setRange} />
          )}

          <KeyNumbers series={series} stats={stats} range={range} focusYear={focus} />

          <Section
            title="When it burns"
            aside={<span className="text-xs text-muted">Drag across months to set dates</span>}
          >
            <Calendar
              series={series} stats={stats} range={range} focusYear={focus} hoverMonth={hoverMonth}
              waveKey={waveKey} onHover={setHoverMonth} onRange={explorer.setRange} onFocusYear={setFocusYear}
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
              <span className="inline-flex items-center gap-2">
                Fewer
                <span className="h-2.5 w-24 rounded-sm" style={{ background: `linear-gradient(90deg, ${HEAT_ZERO}, ${HEAT.join(",")})` }} />
                More detections
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="2" fill="#121829" stroke="#2A3350" strokeDasharray="0" /><path d="M0 12 L12 0" stroke="#2A3350" strokeWidth="2" /></svg>
                No source data
              </span>
              {series.partial.some(Boolean) && (
                <span className="inline-flex items-center gap-1.5">
                  <svg width="12" height="12" aria-hidden><rect x=".5" y=".5" width="11" height="11" rx="2" fill="none" stroke="#9AA6C0" strokeDasharray="2 1.5" /></svg>
                  Partial month
                </span>
              )}
            </div>
            {series.approximate && (
              <p className="mt-2 text-xs text-muted">Months are built from ISO weeks (each week counts in the month of its Thursday), so totals are approximate.</p>
            )}
          </Section>

          <Section title="Compared with the average">
            <Anomalies
              series={series} stats={stats} focusYear={focus} hoverMonth={hoverMonth} waveKey={waveKey}
              onFocusYear={setFocusYear} onHover={setHoverMonth}
            />
          </Section>

          {loaded && "grid" in loaded && (
            <Section title="MODIS and VIIRS compared" aside={<span className="text-xs text-muted">Detections per year</span>}>
              <SensorCompare explorer={explorer} grid={loaded.grid} />
            </Section>
          )}

          {loaded?.recent && (
            <Section title="Last 7 days" aside={<span className="text-xs text-muted">By satellite</span>}>
              <RecentBySatellite explorer={explorer} showingOnMap={showingRecent} onShowOnMap={onShowRecent} />
            </Section>
          )}

          <Section title="Download">
            <Export key={`${explorer.place?.id}:${explorer.selectionLabel}:${explorer.platform}`} explorer={explorer} />
          </Section>

          <About explorer={explorer} />
        </>
      )}
    </div>
  );
}

function About({ explorer }: { explorer: Explorer }) {
  const { loaded } = explorer;
  if (!loaded) return null;
  const info = "grid" in loaded
    ? {
      source: explorer.series?.source ?? "",
      unit: loaded.grid.unit,
      sources: [...loaded.grid.sources, ...Object.entries(loaded.grid.sensors).flatMap(([k, v]) => v.processing.map((p) => `${k} ${p}.`))],
      rules: [...new Set(Object.values(loaded.grid.sensors).flatMap((v) => v.quality_rules))],
      harmonization: `${loaded.grid.harmonization.method} ${loaded.grid.harmonization.caveats.join(" ")}`,
      limitations: loaded.grid.limitations,
    }
    : {
      source: `${explorer.platform}, weekly export`,
      unit: "quality-filtered hotspot detections per area and ISO week",
      sources: loaded.metadata.sources,
      rules: loaded.metadata.quality_rules,
      harmonization: loaded.metadata.harmonization_status,
      limitations: [...loaded.metadata.limitations, loaded.metadata.observation_coverage],
    };
  return (
    <details className="group border-t border-border/70 pt-5 text-sm">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between font-semibold">
        About this data
        <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
      </summary>
      <dl className="mt-2 space-y-3 text-xs leading-relaxed text-muted">
        <div><dt className="font-semibold text-text">Series</dt><dd>{info.source}. Counted as {info.unit}.</dd></div>
        <div><dt className="font-semibold text-text">Sources</dt><dd>{info.sources.join(" ")}</dd></div>
        <div><dt className="font-semibold text-text">Quality rules</dt><dd><ul className="list-disc pl-4">{info.rules.map((r) => <li key={r}>{r}</li>)}</ul></dd></div>
        <div><dt className="font-semibold text-text">Sensors</dt><dd>{info.harmonization}</dd></div>
        {explorer.series?.baselineNote && (
          <div><dt className="font-semibold text-text">Average</dt><dd>{explorer.series.baselineNote}</dd></div>
        )}
        <div><dt className="font-semibold text-text">Limits</dt><dd><ul className="list-disc pl-4">{info.limitations.map((r) => <li key={r}>{r}</li>)}</ul></dd></div>
        {"grid" in loaded && (
          <div><dt className="font-semibold text-text">Last 7 days</dt><dd>{fmt(loaded.recent.length)} near-real-time MODIS and VIIRS detections, shown on the map. They are not added to the monthly history.</dd></div>
        )}
      </dl>
    </details>
  );
}
