import { useMemo } from "react";
import { CountryPicker } from "../components/CountryPicker";
import { RecordChart } from "../components/RecordChart";
import { viirsStart, yearly } from "../data";
import { useShared } from "../state";
import { Rise, Scene } from "./Scene";

export function Fix() {
  const { record, failed, place } = useShared();
  const rows = useMemo(() => (record ? yearly(record) : []), [record]);
  const center: [number, number] = place
    ? [(place.bbox[0] + place.bbox[2]) / 2, (place.bbox[1] + place.bbox[3]) / 2]
    : [-58, -15];
  const wape = record?.score?.wape;
  return (
    <Scene id="fix" stage={{ center, x: 0.9, y: 0.16, scale: 0.42, dim: 0.25 }}>
      <Rise>
        <h2 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          One scale, from 2000 to today.
        </h2>
      </Rise>
      <Rise delay={0.1} className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="m-0 max-w-xl text-xl text-muted">
          VIIRS where it exists. Before that, MODIS rebuilt on the VIIRS scale, cell by cell.
        </p>
        <CountryPicker />
      </Rise>
      <div className="mt-10 grid items-end gap-10 lg:grid-cols-[1fr_16rem]">
        <div className="min-h-[300px] rounded-3xl border border-border/70 bg-bg/70 p-4 backdrop-blur-md sm:p-7">
          {record ? (
            <RecordChart rows={rows} viirsStart={viirsStart(record)} label={record.label} />
          ) : (
            <p className="grid h-[280px] place-items-center text-sm text-muted">
              {failed ? "The record could not be loaded right now." : "Loading the record."}
            </p>
          )}
        </div>
        {record && wape != null && (
          <Rise delay={0.2}>
            <p key={record.id} className="m-0">
              <span className="heat-text block text-6xl font-bold tabular-nums tracking-tight sm:text-7xl">
                {(wape * 100).toFixed(1)}%
              </span>
              <span className="mt-3 block text-muted">
                Average monthly error for {record.label} when we hide a year and predict it back.
              </span>
            </p>
          </Rise>
        )}
      </div>
    </Scene>
  );
}
