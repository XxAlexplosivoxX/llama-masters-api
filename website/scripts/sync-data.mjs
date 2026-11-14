// Copies the prepared region exports from llama-masters-research/data/processed into
// public/data/regions/, so the site works without the API (static hosting, offline demo).
// Usage: node scripts/sync-data.mjs [path/to/data/processed]
import { cp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const source = resolve(process.argv[2] ?? join(ROOT, "..", "..", "llama-masters-research", "data", "processed"));
const target = join(ROOT, "public", "data", "regions");

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
console.log(`copied ${source} -> ${target}`);
