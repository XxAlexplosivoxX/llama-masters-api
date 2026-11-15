import { HEAT, HEAT_ZERO, SENSOR } from "../lib/color";
import { fmt, fmtCompact } from "../lib/format";
import { MONTHS } from "../lib/series";
import type { SeriesKind } from "../lib/types";
import { fmtTemp, TEMP, type TempScale, type TempUnit } from "../lib/temperature";
import type { MapLayer } from "../map/engine";
import type { GridScale } from "../map/MapView";
import type { Explorer } from "../state";

const SENSOR_BAND = {
  MODIS: "MODIS brightness, bands 21/22",
  VIIRS: "VIIRS I4 brightness",
  HARMONIZED: "VIIRS I4 scale, MODIS mapped onto it before 2012",
} as const;

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
  tall = false,
}: {
  tall?: boolean;
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`${tall ? "min-h-8" : "min-h-7"} flex-1 rounded-md px-2 text-xs ${value === o.id ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One sensor's temperature bar, labelled in the chosen unit. */
function TempBar({ scale, unit, name }: { scale: TempScale; unit: TempUnit; name?: string }) {
  return (
    <div className="mt-3">
      {name && <div className="mb-1 text-2xs text-muted">{name}</div>}
      <div className="h-2.5 rounded-sm" style={{ background: `linear-gradient(90deg, ${TEMP.join(",")})` }} />
      <div className="num mt-1 flex justify-between text-2xs text-muted">
        <span>{fmtTemp(scale.lo, unit)}</span>
        <span>{fmtTemp(scale.hi, unit)}</span>
      </div>
    </div>
  );
}

export function Legend({ explorer, layer, gridScale }: { explorer: Explorer; layer: MapLayer; gridScale: GridScale }) {
  const { loaded, series, range, hoverMonth, recent, shape, kind, metric, unit } = explorer;
  const isGrid = loaded && "grid" in loaded;
  const first = loaded?.recent?.[0]?.acquired_utc.slice(0, 10);
  const last = loaded?.recent?.at(-1)?.acquired_utc.slice(0, 10);
  const missingMonth = hoverMonth !== null && series?.values[hoverMonth] == null;
  const temperature = metric === "temperature";

  let title = "";
  let detail = "";
  if (layer === "history" && isGrid && series && range) {
    const monthLabel = (index: number) => `${series.startYear + Math.floor(index / 12)} ${MONTHS[index % 12]}`;
    title = hoverMonth !== null ? monthLabel(hoverMonth) : `${monthLabel(range.from)} to ${monthLabel(range.to)}`;
    detail =
      temperature && gridScale.kind === "temperature"
        ? "Fire temperature · faint cells had few fires"
        : `Hotspots per ${loaded.grid.cell_deg}° cell${shape ? " · this area" : ""}`;
    if (missingMonth) detail = "No source data for this month";
    else if (hoverMonth !== null && series.partial[hoverMonth]) detail += " · partial month";
  } else if (layer === "recent") {
    const dateLabel = (date: string) =>
      `${date.slice(0, 4)} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
    title =
      first && last
        ? first.slice(0, 7) === last.slice(0, 7)
          ? `${dateLabel(first)}–${Number(last.slice(8, 10))}`
          : `${dateLabel(first)} to ${dateLabel(last)}`
        : "Last 7 days";
    detail = loaded?.recent
      ? `${fmt(recent.length)} fires${shape ? " in this area" : ""}${temperature ? " · by temperature" : ""}`
      : "No recent hotspots for this region";
  }
  if (!title) return null;

  const description =
    temperature && gridScale.kind === "temperature" && layer === "history"
      ? `Mean fire brightness temperature per ${loaded && "grid" in loaded ? loaded.grid.cell_deg : ""}° cell, ${SENSOR_BAND[gridScale.sensor]}`
      : undefined;

  return (
    <div className="pointer-events-auto w-72 max-w-full rounded-xl border border-border bg-bg/85 px-4 py-5 backdrop-blur-md">
      {/* Plain text: playback changes the month up to 16 times a second, faster than any cross-fade. */}
      <div className="num text-sm font-semibold">
        {temperature ? "Temperature" : "Hotspots"} · {title}
      </div>
      {layer === "history" ? (
        <div className="mb-4 mt-3">
          <Seg<SeriesKind>
            tall
            label="Satellite record"
            value={kind}
            onChange={explorer.setKind}
            options={[
              { id: "HARMONIZED", label: "Harmonized" },
              { id: "MODIS", label: "MODIS" },
              { id: "VIIRS", label: "VIIRS" },
            ]}
          />
        </div>
      ) : (
        <div className="mb-4 mt-3">
          <Seg
            tall
            label="Recent hotspot sensors"
            value={
              explorer.recentSensors.MODIS && explorer.recentSensors.VIIRS
                ? "BOTH"
                : explorer.recentSensors.MODIS
                  ? "MODIS"
                  : explorer.recentSensors.VIIRS
                    ? "VIIRS"
                    : ""
            }
            onChange={(sensor) => {
              const modis = sensor === "BOTH" || sensor === "MODIS";
              const viirs = sensor === "BOTH" || sensor === "VIIRS";
              if (explorer.recentSensors.MODIS !== modis) explorer.toggleRecentSensor("MODIS");
              if (explorer.recentSensors.VIIRS !== viirs) explorer.toggleRecentSensor("VIIRS");
            }}
            options={[
              { id: "BOTH", label: "Both" },
              { id: "MODIS", label: "MODIS" },
              { id: "VIIRS", label: "VIIRS" },
            ]}
          />
        </div>
      )}
      <div className="mt-1.5 text-xs text-muted" title={description}>
        {detail}
      </div>
      {layer === "history" ? (
        missingMonth ? null : temperature && gridScale.kind === "temperature" ? (
          <TempBar scale={gridScale} unit={unit} />
        ) : gridScale.kind === "count" ? (
          <>
            <div
              className="mt-3 h-2.5 rounded-sm"
              style={{ background: `linear-gradient(90deg, ${HEAT_ZERO}, ${HEAT.join(",")})` }}
            />
            <div className="mt-1 flex justify-between text-2xs text-muted num">
              <span>1</span>
              <span>{`${fmtCompact(gridScale.max)}+`}</span>
            </div>
          </>
        ) : null
      ) : temperature && explorer.recentTemps ? (
        <>
          {explorer.recentSensors.VIIRS && <TempBar scale={explorer.recentTemps.VIIRS} unit={unit} name="VIIRS" />}
          {explorer.recentSensors.MODIS && <TempBar scale={explorer.recentTemps.MODIS} unit={unit} name="MODIS" />}
        </>
      ) : (
        <div className="mt-3 flex items-center gap-4 text-xs">
          {(["VIIRS", "MODIS"] as const).map((s) => (
            <span
              key={s}
              className={`inline-flex items-center gap-1.5 ${explorer.recentSensors[s] ? "" : "opacity-40 line-through"}`}
            >
              <span
                className="inline-block rounded-full"
                aria-hidden
                style={
                  s === "MODIS"
                    ? {
                        width: 11,
                        height: 11,
                        background: `${SENSOR.MODIS.color}80`,
                        border: `1.5px solid ${SENSOR.MODIS.color}`,
                      }
                    : { width: 7, height: 7, background: SENSOR.VIIRS.color }
                }
              />
              {s}
            </span>
          ))}
          <span className="ml-auto text-2xs text-muted">Size: fire power</span>
        </div>
      )}
    </div>
  );
}
