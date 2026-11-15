// Reads the same API as the atlas (3-api_atlas). The site and the API share one Worker, so the
// default is the same origin; VITE_API_URL points a local dev server at the deployed API.
// Everything that arrives is checked before it is used: a malformed file fails the load instead of
// reaching the page.
const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");

const PLACE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/; // the API's own rule (3-api_atlas/src/app.ts)
const MONTH = /^(\d{4})-(\d{2})$/;

export interface Place {
  id: string;
  label: string;
  iso: string[];
  bbox: [number, number, number, number]; // west, south, east, north
  version: string;
  last_day: string;
}

export interface Score {
  model: string;
  wape: number | null; // leave-one-year-out error of the chosen model, 0..1
  spearman: number | null; // rank agreement of yearly totals
  bandCoverage: number | null;
}

/** One country's monthly record, month 0 = `startYear`/`startMonth` (0 = January). */
export interface CountryRecord {
  id: string;
  label: string;
  startYear: number;
  startMonth: number;
  months: number;
  observed: boolean[]; // false = reconstructed from MODIS
  partial: boolean[];
  modis: (number | null)[]; // raw MODIS detections
  harmonized: (number | null)[]; // the record on the VIIRS (NOAA-20) scale
  modisEq: (number | null)[]; // MODIS converted to the VIIRS scale, every month
  p10: (number | null)[];
  p90: (number | null)[];
  median: number[] | null; // 12 values, January first, over the baseline years
  score: Score | null;
}

export interface YearRow {
  year: number;
  modis: number;
  harmonized: number;
  modisEq: number;
  p10: number | null; // band, only for reconstructed years
  p90: number | null;
  reconstructed: boolean;
}

export interface Calendar {
  years: number[];
  cells: (number | null)[][]; // [year][month], null = no data
  reconstructed: boolean[][];
  max: number;
}

export interface Highlights {
  worstYear: { year: number; value: number } | null;
  peakMonth: number | null; // 0..11, by median
  current: { year: number; month: number; value: number; median: number; ratio: number } | null;
}

export interface Jump {
  year: number;
  modis: number;
  viirs: number;
  times: number;
}

export interface Hotspot {
  lon: number;
  lat: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const count = (v: unknown): number | null => (finite(v) && v >= 0 ? v : null);

function series(v: unknown, n: number): (number | null)[] {
  if (!Array.isArray(v)) return Array.from({ length: n }, () => null);
  return Array.from({ length: n }, (_, i) => count(v[i]));
}

async function json(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<unknown>;
}

export function parsePlaces(raw: unknown): Place[] {
  if (!isObject(raw) || !Array.isArray(raw.places)) throw new Error("places: unexpected shape");
  const out: Place[] = [];
  for (const p of (raw.places as unknown[]).slice(0, 1000)) {
    if (!isObject(p) || typeof p.id !== "string" || !PLACE_ID.test(p.id)) continue;
    if (typeof p.label !== "string" || typeof p.version !== "string") continue;
    const b = Array.isArray(p.bbox) && p.bbox.length === 4 && p.bbox.every(finite) ? (p.bbox as number[]) : null;
    if (!b) continue;
    out.push({
      id: p.id,
      label: p.label.slice(0, 80),
      iso: Array.isArray(p.iso) ? p.iso.slice(0, 10).filter((x): x is string => typeof x === "string") : [],
      bbox: [b[0], b[1], b[2], b[3]],
      version: p.version,
      last_day: typeof p.last_day === "string" ? p.last_day : "",
    });
  }
  if (!out.length) throw new Error("places: empty");
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function parseMonthly(raw: unknown): CountryRecord {
  if (!isObject(raw) || typeof raw.start_month !== "string" || !Array.isArray(raw.source))
    throw new Error("monthly: unexpected shape");
  const start = MONTH.exec(raw.start_month);
  if (!start) throw new Error("monthly: bad start_month");
  const areas = Array.isArray(raw.areas) ? (raw.areas as unknown[]).filter(isObject) : [];
  const area = areas.find((a) => a.id === "country") ?? areas[0];
  if (!area || !isObject(area.series)) throw new Error("monthly: no country series");
  const n = Math.min(raw.source.length, 1200);
  const s = area.series;
  const partial = Array.isArray(raw.partial) ? raw.partial : [];
  const baseline = isObject(area.baseline) ? area.baseline.median : null;
  const median =
    Array.isArray(baseline) && baseline.length === 12 && baseline.every(finite) ? (baseline as number[]) : null;
  const sc = isObject(area.score) ? area.score : null;
  const model = sc && typeof sc.model === "string" ? sc.model : null;
  const wapes = sc && isObject(sc.wape) ? sc.wape : null;
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    label: typeof raw.label === "string" ? raw.label.slice(0, 80) : "",
    startYear: Number(start[1]),
    startMonth: Number(start[2]) - 1,
    months: n,
    observed: Array.from({ length: n }, (_, i) => raw.source instanceof Array && raw.source[i] === "observed"),
    partial: Array.from({ length: n }, (_, i) => partial[i] === true),
    modis: series(s.MODIS, n),
    harmonized: series(s.viirs_eq, n),
    modisEq: series(s.modis_eq, n),
    p10: series(s.p10, n),
    p90: series(s.p90, n),
    median,
    score:
      sc && model
        ? {
            model,
            wape: wapes ? count(wapes[model]) : null,
            spearman: finite(sc.year_rank_spearman) ? sc.year_rank_spearman : null,
            bandCoverage: count(sc.band_coverage),
          }
        : null,
  };
}

/** Columnar points, thinned evenly to at most `max` so the globe stays light. */
export function parseRecent(raw: unknown, max: number): Hotspot[] {
  if (!isObject(raw) || !Array.isArray(raw.lon) || !Array.isArray(raw.lat)) throw new Error("recent: unexpected shape");
  const n = Math.min(raw.lon.length, raw.lat.length);
  const step = Math.max(1, Math.ceil(n / Math.max(1, max)));
  const out: Hotspot[] = [];
  for (let i = 0; i < n; i += step) {
    const lon: unknown = raw.lon[i];
    const lat: unknown = raw.lat[i];
    if (finite(lon) && finite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) out.push({ lon, lat });
  }
  return out;
}

let places: Promise<Place[]> | null = null;
/** The country list, fetched once per page. */
export function loadPlaces(): Promise<Place[]> {
  places ??= json(`${API}/v1/places`)
    .then(parsePlaces)
    .catch((e: unknown) => {
      places = null;
      throw e;
    });
  return places;
}

const records = new Map<string, Promise<CountryRecord>>();
/** One fetch per country, shared by every scene that shows it. */
export function loadRecord(place: Place): Promise<CountryRecord> {
  let p = records.get(place.id);
  if (!p) {
    p = json(`${API}/v1/places/${place.id}/monthly?v=${encodeURIComponent(place.version)}`).then(parseMonthly);
    p.catch(() => records.delete(place.id));
    records.set(place.id, p);
  }
  return p;
}

export async function loadRecent(place: Place, max: number): Promise<Hotspot[]> {
  return parseRecent(await json(`${API}/v1/places/${place.id}/recent?v=${encodeURIComponent(place.version)}`), max);
}

const at = (r: CountryRecord, i: number) => {
  const m = r.startMonth + i;
  return { year: r.startYear + Math.floor(m / 12), month: m % 12 };
};

/** Yearly totals for complete years only, so a partial first or last year does not read as a drop. */
export function yearly(r: CountryRecord): YearRow[] {
  const by = new Map<
    number,
    { n: number; modis: number; h: number; eq: number; p10: number; p90: number; rec: number }
  >();
  for (let i = 0; i < r.months; i++) {
    const h = r.harmonized[i];
    if (h === null || r.partial[i]) continue;
    const { year } = at(r, i);
    const row = by.get(year) ?? { n: 0, modis: 0, h: 0, eq: 0, p10: 0, p90: 0, rec: 0 };
    row.n++;
    row.modis += r.modis[i] ?? 0;
    row.h += h;
    row.eq += r.modisEq[i] ?? 0;
    row.p10 += r.p10[i] ?? h;
    row.p90 += r.p90[i] ?? h;
    if (!r.observed[i]) row.rec++;
    by.set(year, row);
  }
  const out: YearRow[] = [];
  for (const [year, v] of by) {
    if (v.n !== 12) continue;
    const reconstructed = v.rec > 6;
    out.push({
      year,
      modis: v.modis,
      harmonized: v.h,
      modisEq: v.eq,
      p10: reconstructed ? v.p10 : null,
      p90: reconstructed ? v.p90 : null,
      reconstructed,
    });
  }
  return out.sort((a, b) => a.year - b.year);
}

/** First year with VIIRS observations, or null when the whole record is reconstructed. */
export function viirsStart(r: CountryRecord): number | null {
  const i = r.observed.indexOf(true);
  return i < 0 ? null : at(r, i).year;
}

export function calendar(r: CountryRecord): Calendar {
  const last = at(r, Math.max(0, r.months - 1)).year;
  const years = Array.from({ length: Math.max(0, last - r.startYear + 1) }, (_, k) => r.startYear + k);
  const cells = years.map(() => Array.from({ length: 12 }, (): number | null => null));
  const reconstructed = years.map(() => Array.from({ length: 12 }, () => false));
  let max = 0;
  for (let i = 0; i < r.months; i++) {
    const { year, month } = at(r, i);
    const v = r.harmonized[i];
    cells[year - r.startYear][month] = v;
    reconstructed[year - r.startYear][month] = !r.observed[i];
    if (v !== null && v > max) max = v;
  }
  return { years, cells, reconstructed, max };
}

/** A typical year, January first: the baseline median, or the mean of the complete months without one. */
export function typical(r: CountryRecord): number[] {
  if (r.median) return r.median;
  const sum = Array.from({ length: 12 }, () => 0);
  const n = Array.from({ length: 12 }, () => 0);
  for (let i = 0; i < r.months; i++) {
    const v = r.harmonized[i];
    if (v === null || r.partial[i]) continue;
    const { month } = at(r, i);
    sum[month] += v;
    n[month]++;
  }
  return sum.map((s, m) => (n[m] ? s / n[m] : 0));
}

export function highlights(r: CountryRecord): Highlights {
  const rows = yearly(r);
  const worst = rows.reduce<YearRow | null>((m, y) => (!m || y.harmonized > m.harmonized ? y : m), null);
  const peakMonth = r.median ? r.median.indexOf(Math.max(...r.median)) : null;
  let current: Highlights["current"] = null;
  for (let i = r.months - 1; i >= 0 && r.median; i--) {
    const value = r.harmonized[i];
    if (value === null || r.partial[i]) continue; // the latest month that is complete
    const { year, month } = at(r, i);
    const median = r.median[month];
    if (median > 0) current = { year, month, value, median, ratio: value / median };
    break;
  }
  return { worstYear: worst ? { year: worst.year, value: worst.harmonized } : null, peakMonth, current };
}

/** The latest complete observed year: what MODIS counted against what VIIRS counted. */
export function jump(r: CountryRecord): Jump | null {
  const rows = yearly(r).filter((y) => !y.reconstructed && y.modis > 0);
  const y = rows.at(-1);
  return y ? { year: y.year, modis: y.modis, viirs: y.harmonized, times: y.harmonized / y.modis } : null;
}
