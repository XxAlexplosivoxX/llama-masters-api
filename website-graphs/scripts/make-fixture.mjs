// Copies ../testdata/tiny-region into public/data/regions/tiny-region and writes a
// RegionEntry[] index.json derived from its files.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(ROOT, "..", "testdata", "tiny-region");
const target = join(ROOT, "..", "website", "public", "data", "regions");

await rm(join(target, "tiny-region"), { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, join(target, "tiny-region"), { recursive: true });

const weekly = JSON.parse(await readFile(join(target, "tiny-region", "weekly_activity.json"), "utf8"));
const areas = JSON.parse(await readFile(join(target, "tiny-region", "areas.geojson"), "utf8"));
const metadata = JSON.parse(await readFile(join(target, "tiny-region", "metadata.json"), "utf8"));

const day = (iso) => new Date(`${iso}T00:00:00Z`).getTime() / 86400000;
const start = weekly.reduce((a, r) => (r.week_start < a ? r.week_start : a), weekly[0].week_start);
const endDay = Math.max(...weekly.map((r) => day(r.week_end))) - 1;
const end = new Date(endDay * 86400000).toISOString().slice(0, 10);

const index = [{
  name: "tiny-region",
  start,
  end,
  platforms: [...new Set(weekly.map((r) => r.platform))].sort(),
  areas: areas.features.length,
  hotspots: metadata.hotspots,
}];
await writeFile(join(target, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`fixture ready in ${target} (${weekly.length} weekly rows, ${start} to ${end})`);
