import { useMemo } from "react";
import { CountryPicker } from "../components/CountryPicker";
import { MonthCalendar } from "../components/MonthCalendar";
import { highlights, typical } from "../data";
import { MONTHS, short } from "../lib/heat";
import { useShared } from "../state";
import { Rise, Scene, useNarrow } from "./Scene";

const LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** How a month compares with its usual level, in words. */
export function against(ratio: number): string {
  if (ratio >= 1.95) return `${ratio.toFixed(1)} times its usual level`;
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  if (pct < 3) return "right at its usual level";
  return `${pct}% ${ratio > 1 ? "above" : "below"} its usual level`;
}

export function Calendar() {
  const { record, failed, place } = useShared();
  const narrow = useNarrow();
  const months = useMemo(() => (record ? typical(record) : null), [record]);
  const facts = useMemo(() => (record ? highlights(record) : null), [record]);
  const center: [number, number] = place
    ? [(place.bbox[0] + place.bbox[2]) / 2, (place.bbox[1] + place.bbox[3]) / 2]
    : [-58, -15];
  return (
    <Scene
      id="calendar"
      stage={
        narrow ? { center, x: 0.5, y: 0.1, scale: 0.42, dim: 0.2 } : { center, x: 0.8, y: 0.2, scale: 0.34, dim: 0.45 }
      }
    >
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,34rem)_1fr]">
        <div className="rounded-3xl border border-border/70 bg-bg/70 p-4 backdrop-blur-md sm:p-7">
          {record && months ? (
            <MonthCalendar months={months} label={record.label} />
          ) : (
            <p className="grid h-[320px] place-items-center text-sm text-muted">
              {failed ? "The calendar could not be loaded right now." : "Loading the calendar."}
            </p>
          )}
        </div>
        <div>
          <Rise>
            <h2 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Hotspot season in {record?.label ?? "a country"}.
            </h2>
          </Rise>
          <Rise delay={0.1}>
            <p className="mt-6 text-xl text-muted">The whole record, folded into one calendar.</p>
          </Rise>
          {facts && (
            <Rise delay={0.2}>
              <dl key={record?.id} className="mt-10 space-y-5 border-t border-border pt-8 text-lg">
                {facts.worstYear && (
                  <div className="flex items-baseline justify-between gap-6">
                    <dt className="text-muted">Worst year</dt>
                    <dd className="m-0 text-right font-semibold tabular-nums">
                      {facts.worstYear.year}
                      <span className="ml-2 font-normal text-muted">{short(facts.worstYear.value)} hotspots</span>
                    </dd>
                  </div>
                )}
                {facts.peakMonth !== null && (
                  <div className="flex items-baseline justify-between gap-6">
                    <dt className="text-muted">Peak month</dt>
                    <dd className="m-0 text-right font-semibold">{LONG[facts.peakMonth]}</dd>
                  </div>
                )}
                {facts.current && (
                  <div className="flex items-baseline justify-between gap-6">
                    <dt className="text-muted">
                      {MONTHS[facts.current.month]} {facts.current.year}
                    </dt>
                    <dd className="m-0 text-right font-semibold">{against(facts.current.ratio)}</dd>
                  </div>
                )}
              </dl>
            </Rise>
          )}
          <Rise delay={0.3} className="mt-8">
            <CountryPicker />
          </Rise>
        </div>
      </div>
    </Scene>
  );
}
