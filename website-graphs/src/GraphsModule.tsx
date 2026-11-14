import { useState } from "react";
import { GraphsStoreContext, useGraphsStore, useStore } from "./hooks/useGraphsStore";
import { usePlaceData, type PlaceData } from "./hooks/usePlaceData";
import { graphsStore, type GraphsStore } from "./state";
import { parseFirmsCsv } from "./lib/csv";
import { usingApi } from "./lib/shared";
import { AreaRanking } from "./components/AreaRanking";
import { Calendar } from "./components/Calendar";
import { Card } from "./components/Card";
import { CurrentMonth } from "./components/CurrentMonth";
import { FocusMonth } from "./components/FocusMonth";
import { Harmonization } from "./components/Harmonization";
import { KeyNumbers } from "./components/KeyNumbers";
import { Last7Days } from "./components/Last7Days";
import { SeasonalCurve } from "./components/SeasonalCurve";
import { Toolbar } from "./components/Toolbar";
import { YearsRanked } from "./components/YearsRanked";
import { labelOf, SERIES_LABEL } from "./lib/shared";

interface Props {
  store?: GraphsStore;
  data?: PlaceData;
}

/** Embeddable analytics module; inject a store to couple it with a host app (e.g. the map). */
export function GraphsModule({ store = graphsStore, data }: Props) {
  return (
    <GraphsStoreContext.Provider value={store}>
      {data ? <Module data={data} /> : <SelfLoading />}
    </GraphsStoreContext.Provider>
  );
}

function SelfLoading() {
  return <Module data={usePlaceData()} />;
}

function Module({ data }: { data: PlaceData }) {
  const store = useStore();
  const focusMonth = useGraphsStore((s) => s.focusMonth);
  const platform = useGraphsStore((s) => s.platform);
  const kind = useGraphsStore((s) => s.kind);
  const [uploadState, setUploadState] = useState<{ info: string | null; error: string | null }>({ info: null, error: null });

  async function onUpload(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const result = await parseFirmsCsv(file);
      try { sessionStorage.setItem("graphs:csv", JSON.stringify({ name: file.name, text })); } catch { /* too large */ }
      store.actions.loadCsv(file.name, text);
      setUploadState({ info: `${result.detections} detections, ${result.skipped} skipped, ${result.from} to ${result.to}`, error: null });
    } catch (error) {
      setUploadState({ info: null, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const { series, stats, range, focus } = data;
  const grid = data.loaded && "grid" in data.loaded ? data.loaded.grid : null;
  if (data.status.kind !== "ready") {
    return (
      <div className="graphs-root">
        <Toolbar data={data} onUpload={onUpload} uploadState={uploadState} />
        <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-grid p-10" role="status">
          {data.status.kind === "loading" ? (
            <div className="w-64 space-y-2">
              <p className="text-sm text-muted">{data.status.message}</p>
              {(data.status.progress ?? [{ step: "history", label: "Data", loaded: 0, total: null }]).map((p) => (
                <div key={p.step}>
                  <div className="flex justify-between text-2xs text-muted"><span>{p.label}</span></div>
                  <div className="h-1 overflow-hidden rounded-full bg-grid">
                    <div
                      className="h-full rounded-full bg-firefly-3 transition-all"
                      style={{ width: p.total ? `${(p.loaded / p.total) * 100}%` : p.loaded ? "60%" : "15%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">{data.status.message}</p>
          )}
        </div>
      </div>
    );
  }

  const generated = grid && (grid as { generated_at_utc?: string }).generated_at_utc?.slice(0, 10);
  const provenance = data.isCsv && data.csv
    ? `Source: uploaded CSV · ${data.csv.name}`
    : grid
      ? `Source: ${grid.sources[0] ?? "NASA FIRMS"}${generated ? ` · generated ${generated}` : ""}`
      : `Source: ${usingApi() ? "live API" : "static export"}`;

  return (
    <div className="graphs-root">
      <Toolbar data={data} onUpload={onUpload} uploadState={uploadState} />

      {grid && data.bbox && !data.cells.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-grid p-4 text-sm text-muted" role="status">
          No {grid.cell_deg}° grid cell has its centre inside this box. Enlarge it or reset to the whole place.
        </p>
      ) : !series || !stats || !range ? (
        <p className="mt-4 rounded-lg border border-dashed border-grid p-4 text-sm text-muted" role="status">
          This selection has no monthly data.
        </p>
      ) : (
        <div className="bento mt-4">
          <div className="bento-kpi">
            <KeyNumbers series={series} stats={stats} range={range} focusYear={focus} />
          </div>

          <Card className="bento-now" title="Current month vs history"
            subtitle="Latest month against the same month in the baseline years">
            <CurrentMonth series={series} stats={stats} />
          </Card>

          <Card className="bento-curve" title={`Seasonal curve · ${SERIES_LABEL[kind]}`}
            subtitle="Focus year vs the baseline p10–p90 band">
            <SeasonalCurve
              series={series} stats={stats} focusYear={focus} focusMonth={focusMonth}
              minYear={stats.years[0]} maxYear={stats.years.at(-1)!}
              onFocusYear={store.actions.focusYear}
              onFocusMonth={store.actions.focusMonth}
            />
          </Card>

          <Card className="bento-focus" title="Focus month by record"
            subtitle={focusMonth !== null ? labelOf(series.startYear, focusMonth) : `${focus ?? "—"} · pick a month`}>
            <FocusMonth data={data} month={focusMonth ?? (focus !== null ? (focus - series.startYear) * 12 + 7 : null)} />
          </Card>

          <Card className="bento-harm" title="How MODIS and VIIRS are combined" subtitle="The harmonization, tested">
            {grid ? (
              <Harmonization data={data} grid={grid} />
            ) : (
              <p className="rounded-lg border border-dashed border-grid p-4 text-sm text-muted">
                Harmonization coefficients are fitted per gridded place, so single-area {data.isCsv ? "uploads" : "weekly exports"} are shown per satellite, without adjustment.
              </p>
            )}
          </Card>

          <Card className="bento-recent" title="Last 7 days" subtitle={grid ? "MODIS vs VIIRS on the MODIS scale" : "MODIS and VIIRS side by side, raw"}>
            <Last7Days points={data.recent} grid={grid} />
          </Card>

          <Card className="bento-calendar" title="Calendar" subtitle="Each square is one month">
            <Calendar
              series={series} stats={stats} range={range} focusYear={focus} focusMonth={focusMonth}
              onFocus={(year, m, ym) => { store.actions.focusYear(year); store.actions.focusMonth(m, ym); }}
            />
          </Card>

          <Card className="bento-ranked" title="Years ranked" subtitle="Complete years vs the average year">
            <YearsRanked stats={stats} focusYear={focus} onFocusYear={store.actions.focusYear} harmonized={kind === "HARMONIZED" && !!grid} />
          </Card>

          {data.loaded && "areas" in data.loaded && data.areas.length > 1 && (
            <Card className="bento-areas" title="Sub-area ranking" subtitle="Range total per area">
              <details>
                <summary className="cursor-pointer text-xs text-muted">Show the ranking (weekly exports only)</summary>
                <div className="mt-2"><AreaRanking loaded={data.loaded} platform={platform} range={range} /></div>
              </details>
            </Card>
          )}
        </div>
      )}

      <footer className="mt-4 text-2xs text-muted">{provenance}</footer>
    </div>
  );
}
