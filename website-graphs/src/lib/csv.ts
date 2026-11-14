import Papa from "papaparse";
import type { MonthlySeries, Platform } from "../types";

export interface FirmsResult {
  points: CsvPointLike[];
  detections: number;
  skipped: number;
  platforms: Platform[];
  from: string;
  to: string;
}

interface CsvPointLike {
  date: string;
  platform: Platform;
  frp: number | null;
  daynight: "D" | "N" | null;
}

const SATELLITE: [RegExp, Platform][] = [
  [/^(terra|t)$/i, "Terra"],
  [/^(aqua|a)$/i, "Aqua"],
  [/^(n|npp|suomi npp|s-npp|snpp)$/i, "S-NPP"],
  [/^(n20|1|noaa-?20|j1)$/i, "NOAA-20"],
  [/^(n21|2|noaa-?21|j2)$/i, "NOAA-21"],
];

const platformOf = (raw: string | undefined): Platform | null => {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return SATELLITE.find(([re]) => re.test(s))?.[1] ?? null;
};

export function parseFirmsCsv(file: File): Promise<FirmsResult> {
  return new Promise((resolve, reject) => {
    file.text().then((text) => parseFirmsText(text).then(resolve, reject), (e: unknown) => reject(e));
  });
}

export function parseFirmsText(text: string): Promise<FirmsResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      worker: false,
      complete: (result) => {
        try {
          resolve(aggregate(result.data, result.meta.fields ?? []));
        } catch (error) {
          reject(error);
        }
      },
      error: (error: Error) => reject(new Error(`CSV could not be parsed: ${error.message}`)),
    });
  });
}

function aggregate(data: Record<string, string>[], fields: string[]): FirmsResult {
  const dateKey = fields.find((f) => f.toLowerCase() === "acq_date");
  if (!dateKey) throw new Error("This CSV has no acq_date column; download a FIRMS archive file.");
  const satField = fields.find((f) => f.toLowerCase() === "satellite")
    ?? fields.find((f) => f.toLowerCase() === "instrument");
  const frpField = fields.find((f) => f.toLowerCase() === "frp");
  const dnField = fields.find((f) => f.toLowerCase() === "daynight");

  let skipped = 0, from = "", to = "";
  const seen = new Set<Platform>();
  const points: CsvPointLike[] = [];
  for (const row of data) {
    const date = (row[dateKey] ?? "").trim();
    const platform = platformOf(satField ? row[satField] : undefined);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !platform) { skipped++; continue; }
    const frp = frpField ? Number(row[frpField]) : NaN;
    const dn = dnField ? (row[dnField] ?? "").trim().toUpperCase() : "";
    points.push({ date, platform, frp: Number.isFinite(frp) ? frp : null, daynight: dn === "D" || dn === "N" ? dn : null });
    seen.add(platform);
    if (!from || date < from) from = date;
    if (!to || date > to) to = date;
  }
  if (!points.length) throw new Error("No usable rows: expected acq_date (YYYY-MM-DD) and a satellite column.");
  return { points, detections: points.length, skipped, platforms: [...seen], from, to };
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Exact monthly series for one platform; edge months are partial when the file does not cover them fully. */
export function csvMonthly(result: FirmsResult, platform: string): MonthlySeries {
  const startYear = Number(result.from.slice(0, 4));
  const endYear = Number(result.to.slice(0, 4));
  const length = (endYear - startYear + 1) * 12;
  const values: (number | null)[] = Array.from({ length }, () => 0);
  for (const p of result.points) {
    if (p.platform !== platform) continue;
    values[(Number(p.date.slice(0, 4)) - startYear) * 12 + Number(p.date.slice(5, 7)) - 1]!++;
  }
  const partial = values.map((_, m) => {
    const year = startYear + Math.floor(m / 12), month = m % 12;
    const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    if (m === 0) return result.from > first;
    if (m === length - 1) return Number(result.to.slice(8, 10)) < daysIn(year, month);
    return false;
  });
  // Months before/after the file's own day span have no coverage at all.
  for (let m = 0; m < length; m++) {
    const year = startYear + Math.floor(m / 12);
    const first = `${year}-${String((m % 12) + 1).padStart(2, "0")}-01`;
    const last = `${year}-${String((m % 12) + 1).padStart(2, "0")}-${String(daysIn(year, m % 12)).padStart(2, "0")}`;
    if (last < result.from || first > result.to) values[m] = null;
  }
  return { startYear, values, partial, approximate: false, source: `${platform}, uploaded FIRMS file` };
}

/** Points of the file's last 7 days (its own max date minus 6). */
export function csvLast7(result: FirmsResult): CsvPointLike[] {
  const cutoff = new Date(new Date(`${result.to}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);
  return result.points.filter((p) => p.date >= cutoff);
}
