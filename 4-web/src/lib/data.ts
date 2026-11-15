import type {
  Hotspot,
  Loaded,
  Meta,
  MonthlyFile,
  MonthlyGrid,
  MonthlyGridFile,
  Place,
  RecentColumns,
  SparseColumns,
  SparseSeries,
} from "./types";

/**
 * The API (3-api). The site is served by the same Worker, so the default is the same origin;
 * VITE_API_URL points a local dev server at the deployed API instead.
 */
const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  if (!(response.headers.get("content-type") ?? "").includes("json")) {
    throw new Error(`${url} is not JSON (the file is probably missing)`);
  }
  return response.json() as Promise<T>;
}

export interface LoadProgress {
  step: "history" | "recent";
  label: string;
  loaded: number; // bytes received
  total: number | null; // bytes expected, when the server says so
}

/** JSON download that reports bytes as they arrive (the history grid is several MB). */
async function getJSONWithProgress<T>(
  url: string,
  signal: AbortSignal | undefined,
  report: (loaded: number, total: number | null) => void,
): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  if (!(response.headers.get("content-type") ?? "").includes("json"))
    throw new Error(`${url} is not JSON (the file is probably missing)`);
  // A compressed response reports its compressed length; the stream yields more bytes than that.
  const encoded = !!response.headers.get("content-encoding");
  const total =
    !encoded && response.headers.get("content-length") ? Number(response.headers.get("content-length")) : null;
  if (!response.body) return response.json() as Promise<T>;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  report(0, total);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    report(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/** Every country with a record, A-Z (exports/places.json). */
export async function loadPlaces(): Promise<Place[]> {
  const index = await getJSON<{ places: Place[] }>(`${API}/v1/places`);
  return index.places;
}

/** The place the site opens on. */
export const DEFAULT_PLACE = "brazil";

/**
 * The calendar counts months from January: pad files that start later (the record starts in
 * November 2000) with months of no data, so index 0 is January of the first year.
 */
function leadMonths(startMonth: string): number {
  return Number(startMonth.slice(5, 7)) - 1;
}

function padAxis<
  T extends {
    start_month: string;
    months: number;
    source: unknown[];
    satellite: unknown[];
    partial: boolean[];
    provisional: boolean[];
  },
>(file: T): number {
  const lead = leadMonths(file.start_month);
  if (!lead) return 0;
  file.source = [...Array(lead).fill(null), ...file.source];
  file.satellite = [...Array(lead).fill(null), ...file.satellite];
  file.partial = [...Array(lead).fill(false), ...file.partial];
  file.provisional = [...Array(lead).fill(false), ...file.provisional];
  file.start_month = `${file.start_month.slice(0, 4)}-01`;
  file.months += lead;
  return lead;
}

/** Flat columns back to one [month, value, ...] array per cell, months shifted by `lead`. */
function unpack(col: SparseColumns, lead: number): SparseSeries[] {
  let j = 0;
  return col.count.map((n) => {
    const pairs: SparseSeries = [];
    let t = lead;
    for (let i = 0; i < n; i++, j++) {
      t = i === 0 ? col.gap[j] + lead : t + col.gap[j];
      pairs.push(t, col.value[j] / col.scale);
    }
    return pairs;
  });
}

function decodeGrid(file: MonthlyGridFile): MonthlyGrid {
  if (file.version !== 5 && file.version !== 6)
    throw new Error(`monthly_grid.json has version ${String(file.version)}; this site reads 5 and 6 (export.py).`);
  const lead = padAxis(file);
  const modis = unpack(file.modis, lead),
    viirsEq = unpack(file.viirs_eq, lead);
  const viirsBt = file.viirs_bt ? unpack(file.viirs_bt, lead) : modis.map(() => []);
  // MODIS temperatures follow the MODIS values one for one (0 = none), so the pairs line up with modis.
  let j = 0;
  const modisBt = modis.map((pairs) => {
    const out: SparseSeries = [];
    for (let i = 0; i < pairs.length; i += 2, j++) out.push(pairs[i], file.modis_bt?.[j] ?? 0);
    return out;
  });
  const { west, south } = file.cells;
  const {
    cells: _cells,
    modis: _m,
    viirs_eq: _v,
    modis_bt: _mb,
    viirs_bt: _vb,
    version: _version,
    series: _series,
    ...axis
  } = file;
  return {
    ...axis,
    cells: west.map((w, i) => [w, south[i], modis[i], viirsEq[i], modisBt[i], viirsBt[i]]),
  };
}

function alignMonthly(monthly: MonthlyFile): MonthlyFile {
  const lead = padAxis(monthly);
  if (lead) {
    const pad = Array(lead).fill(null);
    for (const area of monthly.areas) {
      for (const key of Object.keys(area.series) as (keyof typeof area.series)[])
        area.series[key] = [...pad, ...area.series[key]];
    }
  }
  return monthly;
}

function fromColumns(c: RecentColumns): Hotspot[] {
  return c.lon.map((lon, i) => ({
    lon,
    lat: c.lat[i],
    acquired_utc: c.acquired_utc[i],
    platform: c.platforms[c.platform[i]],
    confidence: c.confidence[i],
    frp: c.frp[i] ?? 0,
    bright: c.bright?.[i] ?? null,
    state: c.state[i] >= 0 ? c.states[c.state[i]] : null,
  }));
}

export async function loadPlace(
  place: Place,
  signal?: AbortSignal,
  onProgress?: (p: LoadProgress[]) => void,
): Promise<Loaded> {
  const base = `${API}/v1/places/${place.id}`;
  const v = place.version ? `?v=${place.version}` : "";
  const steps: LoadProgress[] = [
    { step: "history", label: "Monthly history", loaded: 0, total: null },
    { step: "recent", label: "Last 7 days", loaded: 0, total: null },
  ];
  const track = (i: number) => (loaded: number, total: number | null) => {
    steps[i] = { ...steps[i], loaded, total };
    onProgress?.([...steps]);
  };
  const [grid, monthly, meta, columns, outline] = await Promise.all([
    getJSONWithProgress<MonthlyGridFile>(`${base}/grid${v}`, signal, track(0)),
    getJSON<MonthlyFile>(`${base}/monthly${v}`, signal),
    getJSON<Meta>(`${base}/meta${v}`, signal),
    getJSONWithProgress<RecentColumns>(`${base}/recent${v}`, signal, track(1)).catch(() => null),
    // Optional: exports before outline.json have none, and the map works without it.
    getJSON<{ geometry: GeoJSON.MultiPolygon | null }>(`${base}/outline${v}`, signal).catch(() => null),
  ]);
  return {
    place,
    grid: decodeGrid(grid),
    monthly: alignMonthly(monthly),
    meta,
    recent: columns ? fromColumns(columns) : [],
    outline: outline?.geometry ?? null,
  };
}
