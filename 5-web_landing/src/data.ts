// Reads the same API as the atlas (3-api_atlas). The site and the API share one Worker, so the
// default is the same origin; VITE_API_URL points a local dev server at the deployed API.
const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");

export interface Place {
  id: string;
  label: string;
  kind: string;
  version: string;
  first_month: string;
  last_day: string;
}

interface Monthly {
  start_month: string;
  source: string[];
  partial: boolean[];
  areas: {
    id: string;
    series: Record<string, (number | null)[]>;
    score?: { wape?: Record<string, number>; model?: string; year_rank_spearman?: number };
  }[];
}

export interface YearRow {
  year: number;
  modis: number; // raw MODIS detections
  harmonized: number; // the record on the VIIRS (NOAA-20) scale
  p10: number | null; // band, only for reconstructed years
  p90: number | null;
  reconstructed: boolean; // true while the year is mostly before VIIRS
}

export interface Record_ {
  years: YearRow[];
  viirsStart: number; // first year with VIIRS observations
  wape: number | null; // leave-one-year-out error of the chosen model
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} answered HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function loadPlaces(): Promise<Place[]> {
  const d = await json<{ places: Place[] }>(`${API}/v1/places`);
  return d.places;
}

/** Yearly totals for complete years only, so a partial first or last year does not read as a drop. */
export async function loadRecord(place: Place): Promise<Record_> {
  const d = await json<Monthly>(`${API}/v1/places/${place.id}/monthly?v=${place.version}`);
  const area = d.areas.find((a) => a.id === "country") ?? d.areas[0];
  const [y0, m0] = d.start_month.split("-").map(Number);
  const s = area.series;
  const byYear = new Map<number, { n: number; modis: number; h: number; p10: number; p90: number; rec: number }>();
  for (let i = 0; i < d.source.length; i++) {
    const year = y0 + Math.floor((m0 - 1 + i) / 12);
    const row = byYear.get(year) ?? { n: 0, modis: 0, h: 0, p10: 0, p90: 0, rec: 0 };
    if (d.partial[i]) row.n -= 100; // never complete
    row.n++;
    row.modis += s.MODIS?.[i] ?? 0;
    row.h += s.viirs_eq?.[i] ?? 0;
    row.p10 += s.p10?.[i] ?? s.viirs_eq?.[i] ?? 0;
    row.p90 += s.p90?.[i] ?? s.viirs_eq?.[i] ?? 0;
    if (d.source[i] === "reconstructed") row.rec++;
    byYear.set(year, row);
  }
  const years: YearRow[] = [];
  for (const [year, r] of byYear) {
    if (r.n !== 12) continue;
    const reconstructed = r.rec > 6;
    years.push({
      year,
      modis: r.modis,
      harmonized: r.h,
      p10: reconstructed ? r.p10 : null,
      p90: reconstructed ? r.p90 : null,
      reconstructed,
    });
  }
  const first = d.source.indexOf("observed");
  const viirsStart = y0 + Math.floor((m0 - 1 + Math.max(0, first)) / 12);
  const model = area.score?.model;
  const wape = model ? (area.score?.wape?.[model] ?? null) : null;
  return { years, viirsStart, wape };
}
