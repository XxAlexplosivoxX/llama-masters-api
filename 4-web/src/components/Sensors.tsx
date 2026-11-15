import { motion } from "motion/react";
import type { Loaded, SeriesKind } from "../lib/types";
import type { Explorer } from "../state";

const VIEWS: { kind: SeriesKind; label: string }[] = [
  { kind: "HARMONIZED", label: "Harmonized" },
  { kind: "MODIS", label: "MODIS only" },
  { kind: "VIIRS", label: "VIIRS only" },
];

/** Which record the calendar and map use. Harmonized is the default; single sensors are for checking. */
export function SeriesView({ explorer }: { explorer: Explorer }) {
  const { kind, setKind } = explorer;
  return (
    <div className="seg w-full" role="radiogroup" aria-label="Record shown in the calendar and map">
      {VIEWS.map((v) => (
        <button
          key={v.kind}
          role="radio"
          aria-checked={kind === v.kind}
          aria-pressed={kind === v.kind}
          className="flex-1 justify-center"
          onClick={() => setKind(v.kind)}
        >
          {kind === v.kind && (
            <motion.span
              layoutId="series-view"
              className="absolute inset-0 rounded-[9px] bg-surface-2 ring-1 ring-border"
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span className="relative">{v.label}</span>
        </button>
      ))}
    </div>
  );
}

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${Math.round(v * 100)}%`);

/** The method in three steps, with this country's held-out scores underneath. */
export function HowCombined({ explorer, loaded }: { explorer: Explorer; loaded: Loaded }) {
  const { meta } = loaded;
  const h = meta.harmonization;
  const s = h.score;
  const perModis = h.modis_to_snpp !== null && h.f_npp !== null ? h.modis_to_snpp * h.f_npp : null;
  const years = h.fit_years ? `${h.fit_years[0]}–${h.fit_years[1]}` : "the years both flew";
  const fellBack = h.model === "ratio_fm";
  const states = loaded.monthly.areas.length - 1;

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
        <li>
          <span className="font-semibold text-text">3. The years before VIIRS.</span>{" "}
          {fellBack ? (
            <>
              MODIS is converted with {meta.label}'s own ratio and a factor per calendar month, fitted on {years}:
              per-cell ratios did not do better here.
            </>
          ) : (
            <>
              MODIS is converted cell by cell (0.5°) and month by month, with ratios fitted on {years}, when both flew.
            </>
          )}{" "}
          Converted months carry a p10–p90 range in the monthly data.
        </li>
      </ol>

      <p className="text-muted">
        <span className="font-semibold text-text">Checked on years it never saw.</span>{" "}
        {s.test_months > 0 && s.wape ? (
          <>
            Leaving out one year at a time, converted MODIS was off from real VIIRS by{" "}
            <span className="num text-text">{pct(s.wape[s.model])}</span> month to month across {meta.label}
            {s.bias != null && (
              <>
                {" "}
                ({s.bias >= 0 ? "+" : ""}
                {(s.bias * 100).toFixed(1)}% overall)
              </>
            )}
            ; one fixed ratio would be off by <span className="num">{pct(s.wape.fixed)}</span>.
            {s.band_coverage != null && (
              <>
                {" "}
                The p10–p90 range held the real value in <span className="num">{pct(s.band_coverage)}</span> of those
                months.
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
            {meta.label} has too few years with both satellites to test the conversion: read the years before 2012 with
            care.
          </>
        )}
      </p>

      <div className="space-y-1.5">
        <p className="text-xs text-muted">Show the calendar and map with</p>
        <SeriesView explorer={explorer} />
      </div>
    </div>
  );
}
