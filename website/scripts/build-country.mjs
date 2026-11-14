// Builds one country's exports for the website from public NASA FIRMS data:
//   public/data/<id>/monthly_grid.json     MODIS and VIIRS S-NPP monthly detections on a 0.5° grid,
//                                          plus the fitted MODIS-equivalent adjustment and its test scores
//   public/data/<id>/recent_hotspots.json  last 7 days of near-real-time MODIS + VIIRS detections
//   public/data/<id>/meta.json
//   public/data/places.json                index of every built country
// Past years stream NASA's yearly country CSVs (no key). The current year comes from the FIRMS
// area API (standard processing where released, near-real-time after) and needs FIRMS_MAP_KEY in
// .env.local. Per-year aggregates are cached in .cache/, so a rerun only downloads what changed.
// Usage: node scripts/build-country.mjs --country brazil [--from 2000] [--archive-to 2025] [--no-api]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIRMS = "https://firms.modaps.eosdis.nasa.gov";
const CELL = 0.5;
const FINE = 0.1; // country mask resolution for API and 7-day points

export const COUNTRIES = {
  brazil: { label: "Brazil", file: "Brazil", bbox: [-74, -34, -34.5, 5.5] },
  bolivia: { label: "Bolivia", file: "Bolivia", bbox: [-69.7, -23, -57.4, -9.6] },
  paraguay: { label: "Paraguay", file: "Paraguay", bbox: [-62.7, -27.7, -54.2, -19.2] },
  argentina: { label: "Argentina", file: "Argentina", bbox: [-73.6, -55.1, -53.6, -21.7] },
  colombia: { label: "Colombia", file: "Colombia", bbox: [-79.1, -4.3, -66.8, 12.5] },
};

// MODIS confidence is 0-100 (FIRMS "low" is below 30); VIIRS uses l / n / h.
const SENSORS = {
  MODIS: {
    archive: "modis", first: "2000-11-01", sp: "MODIS_SP", nrt: "MODIS_NRT",
    series: "MODIS (Terra + Aqua), Collection 6.1",
    lowConfidence: (raw) => Number(raw) < 30,
    rules: ["Dropped MODIS confidence below 30 % (FIRMS low class)"],
  },
  VIIRS: {
    archive: "viirs-snpp", first: "2012-01-20", sp: "VIIRS_SNPP_SP", nrt: "VIIRS_SNPP_NRT",
    series: "VIIRS (Suomi NPP), Collection 2, 375 m",
    lowConfidence: (raw) => raw === "l" || raw === "low",
    rules: ["Dropped VIIRS low confidence (FIRMS l class)"],
  },
};

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const ID = flag("--country", "brazil");
const COUNTRY = COUNTRIES[ID];
if (!COUNTRY) throw new Error(`Unknown country "${ID}". Known: ${Object.keys(COUNTRIES).join(", ")}`);
const FROM = Number(flag("--from", 2000));
const ARCHIVE_TO = Number(flag("--archive-to", 2025));
const USE_API = !args.includes("--no-api");
const TODAY = new Date().toISOString().slice(0, 10);
const END_YEAR = USE_API ? Number(TODAY.slice(0, 4)) : ARCHIVE_TO;
const MONTHS = (END_YEAR - FROM + 1) * 12;
const OUT = join(ROOT, "public", "data", ID);
const CACHE = join(ROOT, ".cache", ID);

try { process.loadEnvFile(join(ROOT, ".env.local")); } catch { /* optional */ }
const KEY = process.env.FIRMS_MAP_KEY;

async function* lines(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (response.status >= 400 && response.status < 500) {
        const body = (await response.text()).slice(0, 120);
        // The key allows a fixed number of transactions per 10 minutes: wait the window out.
        if (/transaction limit/i.test(body) && attempt < 4) {
          console.warn("FIRMS transaction limit reached, waiting 10 minutes");
          await new Promise((r) => setTimeout(r, 10 * 60 * 1000 + 5000));
          continue;
        }
        throw Object.assign(new Error(`HTTP ${response.status} ${body}`), { final: true });
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let rest = "";
      for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
        const parts = (rest + chunk).split("\n");
        rest = parts.pop();
        for (const line of parts) if (line) yield line.replace(/\r$/, "");
      }
      if (rest) yield rest;
      return;
    } catch (error) {
      const safe = url.replace(KEY ?? "\0", "<key>");
      if (attempt >= 3 || error.final) throw new Error(`${safe}: ${error.message}`);
      console.warn(`retrying ${safe} (${error.message})`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

const cellKey = (lat, lon) => `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`;
const fineKey = (lat, lon) => `${Math.floor(lon / FINE)}:${Math.floor(lat / FINE)}`;
const inBox = (lat, lon) => lon >= COUNTRY.bbox[0] && lon <= COUNTRY.bbox[2] && lat >= COUNTRY.bbox[1] && lat <= COUNTRY.bbox[3];

/** Reads one FIRMS CSV into monthly counts per cell. `mask` (fine keys) drops points outside the country. */
async function aggregate(url, sensor, mask) {
  const cells = {}; // key -> { "YYYY-MM": count }
  const fine = new Set();
  const quality = { read: 0, low_confidence: 0, static_type: 0, outside: 0, kept: 0 };
  let header = null, last = "";
  for await (const line of lines(url)) {
    const f = line.split(",");
    if (!header) {
      if (f[0] !== "latitude") throw new Error(`unexpected answer: ${line.slice(0, 120)}`);
      header = Object.fromEntries(f.map((name, i) => [name, i]));
      continue;
    }
    quality.read++;
    const lat = Number(f[header.latitude]), lon = Number(f[header.longitude]);
    if (mask && (!inBox(lat, lon) || !mask.has(fineKey(lat, lon)))) { quality.outside++; continue; }
    if (SENSORS[sensor].lowConfidence(f[header.confidence])) { quality.low_confidence++; continue; }
    if ("type" in header && f[header.type] !== "0") { quality.static_type++; continue; }
    const date = f[header.acq_date];
    if (date > last) last = date;
    const month = date.slice(0, 7);
    const key = cellKey(lat, lon);
    (cells[key] ??= {})[month] = (cells[key][month] ?? 0) + 1;
    if (!mask) fine.add(fineKey(lat, lon));
    quality.kept++;
  }
  return { cells, fine: [...fine], quality, last };
}

async function cached(name, build) {
  const file = join(CACHE, `${name}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const value = await build();
  await writeFile(file, JSON.stringify(value));
  return value;
}

async function pool(tasks, size) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }));
  return results;
}

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Area-API requests (the API allows 1 to 5 days each) covering [from, to] with one source. */
function chunks(source, from, to) {
  const out = [];
  for (let day = from; day <= to; day = addDays(day, 5)) {
    out.push({ source, day, days: Math.min(5, dayDiff(day, to) + 1) });
  }
  return out;
}

async function availability() {
  const rows = [];
  for await (const line of lines(`${FIRMS}/api/data_availability/csv/${KEY}/all`)) rows.push(line.split(","));
  if (rows[0]?.[0] !== "data_id") throw new Error(`FIRMS key rejected: ${rows.flat().join(" ").slice(0, 120)}`);
  return Object.fromEntries(rows.slice(1).map(([id, min, max]) => [id, { min, max }]));
}

// ---------------------------------------------------------------------------------------------

await mkdir(OUT, { recursive: true });
await mkdir(CACHE, { recursive: true });
console.log(`${COUNTRY.label}: archive ${FROM}-${ARCHIVE_TO}${USE_API ? `, API to ${TODAY}` : ""}`);

const parts = { MODIS: [], VIIRS: [] };
const lastDay = { MODIS: "", VIIRS: "" };
const processing = { MODIS: [], VIIRS: [] };

// 1. Yearly country archives (standard processing), cached per sensor and year.
const archiveTasks = [];
for (const [sensor, s] of Object.entries(SENSORS)) {
  const firstYear = Math.max(FROM, Number(s.first.slice(0, 4)));
  for (let y = firstYear; y <= ARCHIVE_TO; y++) {
    archiveTasks.push(async () => {
      const result = await cached(`${s.archive}-${y}`, () =>
        aggregate(`${FIRMS}/data/country/${s.archive}/${y}/${s.archive}_${y}_${COUNTRY.file}.csv`, sensor, null));
      console.log(`${sensor} ${y}: ${result.quality.kept.toLocaleString()} kept`);
      parts[sensor].push(result);
      if (result.last > lastDay[sensor]) lastDay[sensor] = result.last;
      return result;
    });
  }
  processing[sensor].push(`${Math.max(FROM, Number(s.first.slice(0, 4)))}-${ARCHIVE_TO}: yearly country archive, standard processing`);
}
await pool(archiveTasks, 3);
for (const sensor of Object.keys(SENSORS)) lastDay[sensor] = `${ARCHIVE_TO}-12-31`;

// The archive is clipped to the country by NASA; its 0.1° cells become the mask for bbox-based data.
const mask = new Set(Object.values(parts).flat().flatMap((p) => p.fine));
console.log(`mask: ${mask.size.toLocaleString()} cells of ${FINE}°`);

// 2. Current year from the area API: standard processing while released, then near-real-time.
let provisionalFrom = {};
if (USE_API && END_YEAR > ARCHIVE_TO) {
  if (!KEY) throw new Error("FIRMS_MAP_KEY is missing: add it to website/.env.local, or pass --no-api.");
  const available = await availability();
  const bbox = COUNTRY.bbox.join(",");
  const start = `${ARCHIVE_TO + 1}-01-01`;
  for (const [sensor, s] of Object.entries(SENSORS)) {
    const sp = available[s.sp], nrt = available[s.nrt];
    const spEnd = sp && sp.max >= start ? (sp.max < TODAY ? sp.max : TODAY) : addDays(start, -1);
    const nrtStart = addDays(spEnd, 1);
    const nrtEnd = nrt && nrt.max >= nrtStart ? nrt.max : spEnd;
    const plan = [...(spEnd >= start ? chunks(s.sp, start, spEnd) : []), ...(nrtEnd >= nrtStart ? chunks(s.nrt, nrtStart, nrtEnd) : [])];
    const results = await pool(plan.map((c) => async () => {
      const url = `${FIRMS}/api/area/csv/${KEY}/${c.source}/${bbox}/${c.days}/${c.day}`;
      const name = `api-${c.source}-${c.day}-${c.days}`;
      // Only chunks that ended at least two days ago are final enough to cache.
      const build = () => aggregate(url, sensor, mask);
      return addDays(c.day, c.days + 1) < TODAY ? cached(name, build) : build();
    }), 2);
    results.forEach((r) => parts[sensor].push(r));
    lastDay[sensor] = nrtEnd;
    if (spEnd >= start) processing[sensor].push(`${start} to ${spEnd}: FIRMS area API, standard processing`);
    if (nrtEnd >= nrtStart) {
      processing[sensor].push(`${nrtStart} to ${nrtEnd}: FIRMS area API, near-real-time (provisional)`);
      provisionalFrom[sensor] = nrtStart;
    }
    console.log(`${sensor} ${ARCHIVE_TO + 1}: ${results.reduce((n, r) => n + r.quality.kept, 0).toLocaleString()} kept, to ${nrtEnd}`);
  }
}

// 3. Dense monthly arrays per cell and sensor.
const monthIndex = (ym) => (Number(ym.slice(0, 4)) - FROM) * 12 + Number(ym.slice(5, 7)) - 1;
const grids = {};
const quality = {};
for (const sensor of Object.keys(SENSORS)) {
  const cells = new Map();
  quality[sensor] = { read: 0, low_confidence: 0, static_type: 0, outside: 0, kept: 0 };
  for (const part of parts[sensor]) {
    for (const k of Object.keys(quality[sensor])) quality[sensor][k] += part.quality[k] ?? 0;
    for (const [key, months] of Object.entries(part.cells)) {
      let counts = cells.get(key);
      if (!counts) cells.set(key, (counts = new Int32Array(MONTHS)));
      for (const [ym, n] of Object.entries(months)) {
        const i = monthIndex(ym);
        if (i >= 0 && i < MONTHS) counts[i] += n;
      }
    }
  }
  grids[sensor] = cells;
}
const keys = [...new Set([...grids.MODIS.keys(), ...grids.VIIRS.keys()])].sort();
const zero = new Int32Array(MONTHS);
const series = (sensor, key) => grids[sensor].get(key) ?? zero;

// 4. MODIS-equivalent from VIIRS. Per calendar month m: MODIS ≈ k_m · ((1 + VIIRS)^β_m − 1).
//    β_m is the log-log slope over cell-months where VIIRS saw something (it captures saturation:
//    one large fire fills many 375 m pixels but few 1 km ones); k_m makes training totals match.
//    Fitted on the train years, scored on held-out test years against real MODIS.
const TRAIN = [2012, 2019];
const TEST = [2020, ARCHIVE_TO];
const firstViirs = monthIndex(SENSORS.VIIRS.first.slice(0, 7)) + 1; // Jan 2012 is only partly covered
const yearOf = (i) => FROM + Math.floor(i / 12);
const inYears = (i, [a, b]) => i >= firstViirs && yearOf(i) >= a && yearOf(i) <= b;

const coefficients = Array.from({ length: 12 }, (_, m) => {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const key of keys) {
    const M = series("MODIS", key), V = series("VIIRS", key);
    for (let i = m; i < MONTHS; i += 12) {
      if (!inYears(i, TRAIN) || V[i] <= 0) continue;
      const x = Math.log1p(V[i]), y = Math.log1p(M[i]);
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
  }
  const beta = n > 2 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 1;
  let modis = 0, shape = 0;
  for (const key of keys) {
    const M = series("MODIS", key), V = series("VIIRS", key);
    for (let i = m; i < MONTHS; i += 12) {
      if (!inYears(i, TRAIN)) continue;
      modis += M[i];
      shape += (1 + V[i]) ** beta - 1;
    }
  }
  return { month: m + 1, beta: round(beta, 4), k: round(shape > 0 ? modis / shape : 0, 4), pairs: n };
});
const predict = (v, m) => (v > 0 ? coefficients[m].k * ((1 + v) ** coefficients[m].beta - 1) : 0);

let trainModis = 0, trainViirs = 0;
for (const key of keys) {
  const M = series("MODIS", key), V = series("VIIRS", key);
  for (let i = 0; i < MONTHS; i++) if (inYears(i, TRAIN)) { trainModis += M[i]; trainViirs += V[i]; }
}
const ratio = trainViirs ? trainModis / trainViirs : 0;

function score([a, b]) {
  const actual = [], fitted = [], ratioFit = [], raw = [];
  for (let i = 0; i < MONTHS; i++) {
    if (!inYears(i, [a, b])) continue;
    let A = 0, P = 0, V = 0;
    for (const key of keys) {
      const v = series("VIIRS", key)[i];
      A += series("MODIS", key)[i];
      P += predict(v, i % 12);
      V += v;
    }
    actual.push(A); fitted.push(P); ratioFit.push(V * ratio); raw.push(V);
  }
  const metrics = (pred) => {
    const sumA = actual.reduce((s, v) => s + v, 0);
    const wape = pred.reduce((s, p, i) => s + Math.abs(p - actual[i]), 0) / sumA;
    const bias = pred.reduce((s, v) => s + v, 0) / sumA - 1;
    return { wape: round(wape, 4), bias: round(bias, 4), r: round(correlation(pred, actual), 4) };
  };
  return { years: [a, b], months: actual.length, model: metrics(fitted), single_ratio: metrics(ratioFit), raw_viirs: metrics(raw) };
}

function correlation(x, y) {
  const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
function round(v, digits) { return Math.round(v * 10 ** digits) / 10 ** digits; }

const harmonization = {
  target: "MODIS-equivalent detections: what Terra + Aqua MODIS would likely have reported, estimated from VIIRS S-NPP",
  method: "Per calendar month m and 0.5° cell: MODIS ≈ k_m · ((1 + VIIRS)^β_m − 1); β_m is the log-log slope over cell-months with VIIRS detections, k_m matches training totals.",
  train_years: TRAIN,
  test_years: TEST,
  coefficients,
  single_ratio: round(ratio, 4),
  train: score(TRAIN),
  test: score(TEST),
  caveats: [
    "Scored against MODIS, which is itself a sample of fires, not ground truth.",
    "Terra and Aqua orbits drifted after about 2020 and 2022, so test-year MODIS may read lower for reasons unrelated to fire.",
    "One set of coefficients for the whole country; local landscapes may need their own.",
  ],
};
console.log("harmonization test", harmonization.test);

// 5. Grid file.
const sensorInfo = (sensor) => {
  const s = SENSORS[sensor];
  const first = s.first.slice(0, 7) < `${FROM}-01` ? `${FROM}-01` : s.first.slice(0, 7);
  return {
    series: s.series,
    first_source_month: first,
    first_source_day: s.first,
    last_source_day: lastDay[sensor],
    provisional_from_day: provisionalFrom[sensor] ?? null,
    // Aqua joined Terra in July 2002; VIIRS S-NPP starts January 2012 (first month partial).
    baseline_from_year: sensor === "MODIS" ? Math.max(FROM, 2003) : 2012,
    baseline_note: sensor === "MODIS"
      ? "Averages use 2003 onward, when both Terra and Aqua flew; earlier years had one MODIS satellite and read low."
      : "Averages use 2012 onward, the full VIIRS S-NPP record.",
    quality_rules: [...s.rules, "Dropped type 1-3 (volcano, other static land source, offshore) where the file reports it"],
    quality_counts: quality[sensor],
    processing: processing[sensor],
  };
};

const grid = {
  version: 2,
  name: ID,
  label: COUNTRY.label,
  generated_at_utc: new Date().toISOString(),
  unit: "quality-filtered hotspot detections per 0.5° cell and calendar month (UTC)",
  cell_deg: CELL,
  start_month: `${FROM}-01`,
  months: MONTHS,
  sensors: { MODIS: sensorInfo("MODIS"), VIIRS: sensorInfo("VIIRS") },
  harmonization,
  sources: [
    `NASA FIRMS yearly country archive (${COUNTRY.file}), ${FIRMS}/data/country/`,
    ...(USE_API ? [`NASA FIRMS area API (${ARCHIVE_TO + 1} onward), clipped to the archive's ${FINE}° country footprint`] : []),
  ],
  limitations: [
    "Detections are satellite hotspot pixels, not unique fires or burned area.",
    "MODIS (1 km) and VIIRS (375 m) counts are not on the same scale; compare them only through the MODIS-equivalent series.",
    "Archives are clipped to the country by NASA; cells on the border only count the country's part.",
    "Near-real-time months are provisional and lack the static-source flag, so a few industrial hotspots may remain.",
    "No correction for satellite passes, clouds or viewing geometry.",
  ],
  cells: keys.map((key) => {
    const [x, y] = key.split(":").map(Number);
    return [x * CELL, y * CELL, Array.from(series("MODIS", key)), Array.from(series("VIIRS", key))];
  }),
};
await writeFile(join(OUT, "monthly_grid.json"), JSON.stringify(grid));
console.log(`monthly_grid.json: ${keys.length} cells`);

// 6. Last 7 days, near-real-time, every MODIS and VIIRS satellite FIRMS publishes without a key.
const PLATFORM = { T: "Terra", A: "Aqua", Terra: "Terra", Aqua: "Aqua", N: "S-NPP", N20: "NOAA-20", N21: "NOAA-21", 1: "NOAA-20" };
const VIIRS_CONFIDENCE = { l: "low", n: "nominal", h: "high", low: "low", nominal: "nominal", high: "high" };
const feeds = [
  `${FIRMS}/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_7d.csv`,
  `${FIRMS}/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_7d.csv`,
  `${FIRMS}/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_7d.csv`,
  `${FIRMS}/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_7d.csv`,
];
const points = [];
for (const url of feeds) {
  let header = null;
  try {
    for await (const line of lines(url)) {
      const f = line.split(",");
      if (!header) { header = Object.fromEntries(f.map((name, i) => [name, i])); continue; }
      const lat = Number(f[header.latitude]), lon = Number(f[header.longitude]);
      if (!inBox(lat, lon) || !mask.has(fineKey(lat, lon))) continue;
      const raw = f[header.confidence];
      const confidence = /^\d+$/.test(raw)
        ? (Number(raw) < 30 ? "low" : Number(raw) < 80 ? "nominal" : "high")
        : VIIRS_CONFIDENCE[raw] ?? raw;
      if (confidence === "low") continue;
      const time = f[header.acq_time].padStart(4, "0");
      points.push({
        lon: Math.round(lon * 1e4) / 1e4, lat: Math.round(lat * 1e4) / 1e4,
        acquired_utc: `${f[header.acq_date]}T${time.slice(0, 2)}:${time.slice(2)}Z`,
        platform: PLATFORM[f[header.satellite]] ?? f[header.satellite],
        confidence, frp: Number(f[header.frp]), daynight: f[header.daynight],
      });
    }
  } catch (error) {
    console.warn(`skipped ${url.split("/").pop()}: ${error.message}`);
  }
  console.log(`${url.split("/").pop()}: ${points.length.toLocaleString()} points so far`);
}
points.sort((a, b) => a.acquired_utc.localeCompare(b.acquired_utc));
// Columnar instead of GeoJSON: ~8x smaller, the browser rebuilds features on load.
const platforms = [...new Set(points.map((p) => p.platform))];
await writeFile(join(OUT, "recent_hotspots.json"), JSON.stringify({
  platforms,
  lon: points.map((p) => p.lon),
  lat: points.map((p) => p.lat),
  acquired_utc: points.map((p) => p.acquired_utc),
  platform: points.map((p) => platforms.indexOf(p.platform)),
  confidence: points.map((p) => (p.confidence === "high" ? 2 : 1)),
  frp: points.map((p) => p.frp),
  daynight: points.map((p) => (p.daynight === "D" ? 1 : 0)),
}));

const hotspots = {
  first_day: points[0]?.acquired_utc.slice(0, 10) ?? null,
  last_day: points.at(-1)?.acquired_utc.slice(0, 10) ?? null,
  features: points.length,
};
const meta = {
  name: ID, label: COUNTRY.label, bbox: COUNTRY.bbox, generated_at_utc: new Date().toISOString(),
  history: Object.fromEntries(Object.entries(grid.sensors).map(([k, v]) => [k, {
    series: v.series, first_source_month: v.first_source_month, last_source_day: v.last_source_day,
  }])),
  harmonization_test: harmonization.test.model,
  hotspots,
};
await writeFile(join(OUT, "meta.json"), JSON.stringify(meta, null, 1));

// Index of every country built so far, read by the place switcher.
const indexFile = join(ROOT, "public", "data", "places.json");
const index = existsSync(indexFile) ? JSON.parse(await readFile(indexFile, "utf8")) : [];
const entry = { id: ID, label: COUNTRY.label, bbox: COUNTRY.bbox, base: `./data/${ID}`, history: meta.history, hotspots };
const merged = [...index.filter((p) => p.id !== ID), entry]
  .sort((a, b) => (a.id === "brazil" ? -1 : b.id === "brazil" ? 1 : a.label.localeCompare(b.label)));
await writeFile(indexFile, JSON.stringify(merged, null, 1));
console.log("done", hotspots);
