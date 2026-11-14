// Builds the Brazil exports the website loads, from public NASA FIRMS files (no key):
//   public/data/brazil/monthly_grid.json      MODIS monthly detections on a 0.5° grid, 2000-2025
//   public/data/brazil/hotspots.geojson       last 7 days of MODIS + VIIRS NRT detections
// Files are streamed and aggregated in memory; nothing raw is written to disk.
// Usage: node scripts/build-brazil.mjs [--from 2000] [--to 2025] [--skip-history]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "public", "data", "brazil");
const FIRMS = "https://firms.modaps.eosdis.nasa.gov";
const CELL = 0.5;
const COUNTRY = "Brazil";
const MODIS_MIN_CONFIDENCE = 30; // FIRMS "low" class is below 30 %

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const FROM = flag("--from", 2000);
const TO = flag("--to", 2025);
const SKIP_HISTORY = args.includes("--skip-history");
const MONTHS = (TO - FROM + 1) * 12;

async function* lines(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
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
      if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
      console.warn(`retrying ${url} (${error.message})`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const cellKey = (lat, lon) => `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`;

async function buildHistory() {
  const cells = new Map(); // key -> Int32Array(MONTHS)
  const quality = { read: 0, low_confidence: 0, static_type: 0, kept: 0 };
  const sourceYears = [];

  async function year(y) {
    const url = `${FIRMS}/data/country/modis/${y}/modis_${y}_${COUNTRY}.csv`;
    let header = null;
    for await (const line of lines(url)) {
      const fields = line.split(",");
      if (!header) {
        header = Object.fromEntries(fields.map((name, i) => [name, i]));
        continue;
      }
      quality.read++;
      if (Number(fields[header.confidence]) < MODIS_MIN_CONFIDENCE) { quality.low_confidence++; continue; }
      if ("type" in header && fields[header.type] !== "0") { quality.static_type++; continue; }
      const date = fields[header.acq_date];
      const index = (Number(date.slice(0, 4)) - FROM) * 12 + Number(date.slice(5, 7)) - 1;
      if (index < 0 || index >= MONTHS) continue;
      const key = cellKey(Number(fields[header.latitude]), Number(fields[header.longitude]));
      let counts = cells.get(key);
      if (!counts) cells.set(key, (counts = new Int32Array(MONTHS)));
      counts[index]++;
      quality.kept++;
    }
    sourceYears.push(y);
    console.log(`MODIS ${y}: done (${quality.kept.toLocaleString()} kept so far)`);
  }

  const years = Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i);
  const queue = [...years];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) await year(queue.shift());
  }));

  const grid = {
    name: "brazil",
    label: "Brazil",
    generated_at_utc: new Date().toISOString(),
    series: "MODIS (Terra + Aqua), Collection 6.1 standard processing",
    unit: "quality-filtered hotspot detections per 0.5° cell and calendar month (UTC)",
    cell_deg: CELL,
    start_month: `${FROM}-01`,
    months: MONTHS,
    // MODIS starts in November 2000 (Terra); earlier months have no source data.
    first_source_month: FROM <= 2000 ? "2000-11" : `${FROM}-01`,
    last_source_month: `${TO}-12`,
    source_years: sourceYears.sort(),
    // Aqua joined Terra in July 2002; earlier years have roughly half the overpasses.
    baseline_from_year: Math.max(FROM, 2003),
    baseline_note: "Averages use 2003 onward, when both Terra and Aqua flew; earlier years had one MODIS satellite and read low.",
    quality_rules: [
      "Dropped MODIS confidence below 30 % (FIRMS low class)",
      "Dropped type 1-3 (volcano, other static land source, offshore)",
    ],
    quality_counts: quality,
    sources: [`NASA FIRMS yearly country archive (${COUNTRY}), ${FIRMS}/data/country/`],
    harmonization_status: "Single sensor family (MODIS Terra + Aqua) for the whole record; VIIRS is not merged here.",
    limitations: [
      "Detections are satellite hotspot pixels, not unique fires or burned area.",
      "Country archives are clipped to Brazil by NASA; cells on the border only count the Brazilian part.",
      "No correction for satellite passes, clouds or viewing geometry.",
    ],
    cells: [...cells].map(([key, counts]) => {
      const [x, y] = key.split(":").map(Number);
      return [x * CELL, y * CELL, Array.from(counts)];
    }),
  };
  await writeFile(join(OUT, "monthly_grid.json"), JSON.stringify(grid));
  console.log(`monthly_grid.json: ${grid.cells.length} cells, ${quality.kept.toLocaleString()} detections`);
  return grid;
}

const PLATFORM = { T: "Terra", A: "Aqua", Terra: "Terra", Aqua: "Aqua", N: "S-NPP", N20: "NOAA-20", N21: "NOAA-21" };
const VIIRS_CONFIDENCE = { l: "low", n: "nominal", h: "high", low: "low", nominal: "nominal", high: "high" };

async function buildRecent(mask) {
  const feeds = [
    `${FIRMS}/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_7d.csv`,
    `${FIRMS}/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_7d.csv`,
    `${FIRMS}/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_7d.csv`,
  ];
  const features = [];
  let first = "9999", last = "0000";
  for (const url of feeds) {
    let header = null;
    for await (const line of lines(url)) {
      const f = line.split(",");
      if (!header) { header = Object.fromEntries(f.map((name, i) => [name, i])); continue; }
      const lat = Number(f[header.latitude]), lon = Number(f[header.longitude]);
      if (lon < -75 || lon > -28 || lat < -35 || lat > 6) continue;
      if (!mask.has(cellKey(lat, lon))) continue;
      const raw = f[header.confidence];
      const confidence = /^\d+$/.test(raw)
        ? (Number(raw) < 30 ? "low" : Number(raw) < 80 ? "nominal" : "high")
        : VIIRS_CONFIDENCE[raw] ?? raw;
      if (confidence === "low") continue;
      const date = f[header.acq_date];
      const time = f[header.acq_time].padStart(4, "0");
      if (date < first) first = date;
      if (date > last) last = date;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4] },
        properties: {
          acquired_utc: `${date}T${time.slice(0, 2)}:${time.slice(2)}Z`,
          platform: PLATFORM[f[header.satellite]] ?? f[header.satellite],
          confidence,
          frp: Number(f[header.frp]),
          daynight: f[header.daynight],
          processing: "NRT",
          area_ids: ["brazil"],
        },
      });
    }
    console.log(`${url.split("/").pop()}: ${features.length.toLocaleString()} Brazil points so far`);
  }
  features.sort((a, b) => a.properties.acquired_utc.localeCompare(b.properties.acquired_utc));
  // Columnar instead of GeoJSON: ~8x smaller, the browser rebuilds features on load.
  const platforms = [...new Set(features.map((f) => f.properties.platform))];
  const columns = {
    platforms,
    lon: [], lat: [], acquired_utc: [], platform: [], confidence: [], frp: [], daynight: [],
  };
  for (const { geometry, properties: p } of features) {
    columns.lon.push(geometry.coordinates[0]);
    columns.lat.push(geometry.coordinates[1]);
    columns.acquired_utc.push(p.acquired_utc);
    columns.platform.push(platforms.indexOf(p.platform));
    columns.confidence.push(p.confidence === "high" ? 2 : 1);
    columns.frp.push(p.frp);
    columns.daynight.push(p.daynight === "D" ? 1 : 0);
  }
  await writeFile(join(OUT, "recent_hotspots.json"), JSON.stringify(columns));
  return { first_day: first, last_day: last, features: features.length };
}

await mkdir(OUT, { recursive: true });
const grid = SKIP_HISTORY
  ? JSON.parse(await readFile(join(OUT, "monthly_grid.json"), "utf8"))
  : await buildHistory();
// Recent NRT points are kept only inside cells where the archive (already clipped
// to Brazil by NASA) ever reported a detection: a cheap country mask without a polygon.
const mask = new Set(grid.cells.map(([lon, lat]) => cellKey(lat + CELL / 2, lon + CELL / 2)));
const hotspots = await buildRecent(mask);
await writeFile(join(OUT, "meta.json"), JSON.stringify({
  name: grid.name, label: grid.label, generated_at_utc: new Date().toISOString(),
  history: { series: grid.series, first_source_month: grid.first_source_month, last_source_month: grid.last_source_month },
  hotspots,
}, null, 1));
console.log("done", hotspots);
