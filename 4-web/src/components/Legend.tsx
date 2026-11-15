import { HEAT, HEAT_ZERO, SENSOR } from "../lib/color";
import { fmt, fmtCompact } from "../lib/format";
import { labelOf, MONTHS_LONG, SERIES_LABEL } from "../lib/series";
import { fmtTemp, TEMP, UNIT_LABEL, type Metric, type TempScale, type TempUnit } from "../lib/temperature";
import type { MapLayer } from "../map/engine";
import type { GridScale } from "../map/MapView";
import type { Explorer } from "../state";

const SENSOR_BAND = { MODIS: "MODIS brightness, bands 21/22", VIIRS: "VIIRS I4 brightness" } as const;

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
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
          className={`min-h-7 flex-1 rounded-md px-2 text-xs ${value === o.id ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
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
    <div className="mt-2">
      {name && <div className="mb-1 text-2xs text-muted">{name}</div>}
      <div className="h-2 rounded-sm" style={{ background: `linear-gradient(90deg, ${TEMP.join(",")})` }} />
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
    title =
      hoverMonth !== null
        ? `${MONTHS_LONG[hoverMonth % 12]} ${series.startYear + Math.floor(hoverMonth / 12)}`
        : `${labelOf(series.startYear, range.from)} to ${labelOf(series.startYear, range.to)}`;
    detail =
      temperature && gridScale.kind === "temperature"
        ? `Mean fire temperature per ${loaded.grid.cell_deg}° cell: ${SENSOR_BAND[gridScale.sensor]}`
        : `${SERIES_LABEL[kind]} hotspots per ${loaded.grid.cell_deg}° cell${shape ? ", this area only" : ""}`;
    if (missingMonth) detail = "No source data for this month";
    else if (hoverMonth !== null && series.partial[hoverMonth]) detail += "; partial month";
  } else if (layer === "recent") {
    title = first ? `${first} to ${last} (UTC)` : "Last 7 days";
    detail = loaded?.recent
      ? `${fmt(recent.length)} fires${shape ? " in this area" : ""}${!explorer.recentSensors.MODIS ? ", VIIRS only" : !explorer.recentSensors.VIIRS ? ", MODIS only" : ""}${temperature ? ", coloured by temperature" : ""}`
      : "This region has no recent hotspots export";
  }
  if (!title) return null;

  const hasTemps = !!(layer === "recent" ? explorer.recentTemps : explorer.temps?.VIIRS.hi || explorer.temps?.MODIS.hi);

  return (
    <div className="pointer-events-auto w-72 max-w-full rounded-xl border border-border bg-bg/85 px-3.5 py-3 backdrop-blur-md">
      {hasTemps && (
        <div className="mb-2.5 flex gap-1.5">
          <div className="flex-1">
            <Seg<Metric>
              label="Colour the map by"
              value={metric}
              onChange={explorer.setMetric}
              options={[
                { id: "count", label: "Detections" },
                { id: "temperature", label: "Temperature" },
              ]}
            />
          </div>
          {temperature && (
            <Seg<TempUnit>
              label="Temperature unit"
              value={unit}
              onChange={explorer.setUnit}
              options={(["C", "F", "K"] as const).map((u) => ({ id: u, label: UNIT_LABEL[u] }))}
            />
          )}
        </div>
      )}
      {/* Plain text: playback changes the month up to 16 times a second, faster than any cross-fade. */}
      <div className="num text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted">{detail}</div>
      {layer === "history" ? (
        missingMonth ? null : temperature && gridScale.kind === "temperature" ? (
          <TempBar scale={gridScale} unit={unit} />
        ) : gridScale.kind === "count" ? (
          <>
            <div
              className="mt-2 h-2 rounded-sm"
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
          {explorer.recentSensors.VIIRS && (
            <TempBar scale={explorer.recentTemps.VIIRS} unit={unit} name={SENSOR_BAND.VIIRS} />
          )}
          {explorer.recentSensors.MODIS && (
            <TempBar scale={explorer.recentTemps.MODIS} unit={unit} name={SENSOR_BAND.MODIS} />
          )}
        </>
      ) : (
        <div className="mt-2 flex items-center gap-4 text-xs">
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
