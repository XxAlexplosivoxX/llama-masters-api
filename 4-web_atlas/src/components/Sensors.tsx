import { lazy, Suspense, useMemo } from "react";
import { useWidth } from "../hooks/useWidth";
import { seamSeries } from "../lib/series";
import type { Loaded } from "../lib/types";
import type { Explorer } from "../state";

const SeamChart = lazy(() => import("./charts/Sensors").then((m) => ({ default: m.Sensors })));

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${Math.round(v * 100)}%`);

/** The method in three steps, with this country's held-out scores and the seam check underneath. */
export function HowCombined({ explorer, loaded }: { explorer: Explorer; loaded: Loaded }) {
  const { meta } = loaded;
  const h = meta.harmonization;
  const s = h.score;
  // Global with several countries: each country was harmonized and scored on its own.
  const parts = loaded.parts && loaded.parts.length > 1 ? loaded.parts : null;
  const perModis = !parts && h.modis_to_snpp !== null && h.f_npp !== null ? h.modis_to_snpp * h.f_npp : null;
  const years = h.fit_years ? `${h.fit_years[0]}–${h.fit_years[1]}` : "the years both flew";
  const fellBack = h.model === "ratio_fm";
  const states = loaded.monthly.areas.length - 1;
  const { ref, width } = useWidth();
  // the seam check is exported per country (and state), not per drawn area
  const monthly = useMemo(
    () => (explorer.shape || parts ? null : seamSeries(loaded.monthly)),
    [loaded, explorer.shape, parts],
  );
  const animationKey = `${explorer.place?.id}:${explorer.kind}:${explorer.range?.from}:${explorer.range?.to}`;

  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <ol className="space-y-2 text-muted">
        <li>
          <span className="font-semibold text-text">1. Two satellite records.</span> MODIS has looked since 2000 with 1
          km pixels; VIIRS since 2012 with 375 m pixels, so it sees smaller fires and splits big ones into more pixels.
          {perModis !== null && (
            <>
              {" "}
              Here one MODIS hotspot corresponds to about <span className="num text-text">
                {perModis.toFixed(1)}
              </span>{" "}
              VIIRS hotspots.
            </>
          )}
        </li>
        <li>
          <span className="font-semibold text-text">2. One scale: VIIRS.</span> VIIRS keeps flying, so the record is on
          its scale (NOAA-20). From 2012 every month uses real VIIRS: NOAA-20, else NOAA-21, else S-NPP adjusted to
          NOAA-20. Satellites are never added together.
        </li>
        {parts ? (
          <li>
            <span className="font-semibold text-text">3. The years before VIIRS.</span> MODIS is converted country by
            country, with each country's own ratios fitted on the years both flew. Converted months carry a p10–p90
            range in the monthly data.
          </li>
        ) : (
          <li>
            <span className="font-semibold text-text">3. The years before VIIRS.</span>{" "}
            {fellBack ? (
              <>
                MODIS is converted with {meta.label}'s own ratio and a factor per calendar month, fitted on {years}:
                per-cell ratios did not do better here.
              </>
            ) : (
              <>
                MODIS is converted cell by cell (0.5°) and month by month, with ratios fitted on {years}, when both
                flew.
              </>
            )}{" "}
            Converted months carry a p10–p90 range in the monthly data.
          </li>
        )}
      </ol>

      {parts && (
        <div>
          <p className="mb-2 text-muted">
            <span className="font-semibold text-text">Checked on years it never saw,</span> leaving out one year at a
            time (error of converted MODIS against real VIIRS, month to month):
          </p>
          <dl className="text-xs">
            {parts.map((part) => {
              const ph = part.meta.harmonization;
              const ps = ph.score;
              const ratio = ph.modis_to_snpp !== null && ph.f_npp !== null ? ph.modis_to_snpp * ph.f_npp : null;
              return (
                <div
                  key={part.place.id}
                  className="grid grid-cols-[1fr_auto] gap-x-3 border-t border-border/60 py-1.5 first:border-t-0"
                >
                  <dt className="truncate text-text" title={part.place.label}>
                    {part.place.label}
                  </dt>
                  <dd className="num text-right text-muted">
                    {ps.test_months > 0 && ps.wape ? `${pct(ps.wape[ps.model])} error` : "Too few years to test"}
                  </dd>
                  <dd className="col-span-2 text-muted">
                    {ratio !== null ? `1 MODIS ≈ ${ratio.toFixed(1)} VIIRS hotspots` : "No MODIS–VIIRS ratio"}
                    {ph.model === "ratio_fm" ? " · one ratio for the country" : " · per-cell ratios"}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-2 text-xs text-muted">
            The MODIS vs VIIRS chart is per country: open one country to see it.
          </p>
        </div>
      )}

      {!parts && (
        <p className="text-muted">
          <span className="font-semibold text-text">Checked on years it never saw.</span>{" "}
          {s.test_months > 0 && s.wape ? (
            <>
              Leaving out one year at a time, converted MODIS was off from real VIIRS by{" "}
              <span className="num text-text">{pct(s.wape[s.model])}</span> month to month across {meta.label}
              {s.bias != null && (
                <>
                  {" "}
                  {Math.abs(s.bias) < 0.0005
                    ? "(no bias over the whole record)"
                    : `(${s.bias > 0 ? "+" : ""}${(s.bias * 100).toFixed(1)}% over the whole record)`}
                </>
              )}
              ; one fixed ratio would be off by <span className="num">{pct(s.wape.fixed)}</span>.
              {s.band_coverage != null && (
                <>
                  {" "}
                  The estimated range (p10–p90) held the real value in{" "}
                  <span className="num">{pct(s.band_coverage)}</span> of those months.
                </>
              )}
              {states > 0 && h.states_on_fallback.length > 0 && (
                <>
                  {" "}
                  {h.states_on_fallback.length} of {states} states use their own ratio instead of the per-cell one.
                </>
              )}
            </>
          ) : (
            <>
              {meta.label} has too few years with both satellites to test the conversion: read the years before 2012
              with care.
            </>
          )}
        </p>
      )}

      <p className="text-muted">Switch between Harmonized, MODIS and VIIRS in the map legend.</p>

      <div ref={ref}>
        {monthly && explorer.range && width > 0 && (
          <Suspense fallback={<div className="h-44 animate-pulse rounded-lg bg-surface-2/70" aria-hidden />}>
            <SeamChart monthly={monthly} range={explorer.range} width={width} animationKey={animationKey} />
          </Suspense>
        )}
        {explorer.shape && !parts && (
          <p className="text-xs text-muted">
            The MODIS vs VIIRS check covers the whole of {meta.label}; clear the drawn area to see it.
          </p>
        )}
      </div>
    </div>
  );
}
