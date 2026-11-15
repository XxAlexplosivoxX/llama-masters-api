/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const rel = (p: string) => relative(ROOT, p);
const files = walk(SRC).filter((p) => !/\.test\.tsx?$/.test(p) && !p.startsWith(join(SRC, "test") + "/"));
const sources = files.map((p) => ({ path: rel(p), text: readFileSync(p, "utf8") }));
const tsx = sources.filter((s) => s.path.endsWith(".tsx"));
const index = { path: "index.html", text: readFileSync(join(ROOT, "index.html"), "utf8") };

const offenders = (list: { path: string; text: string }[], re: RegExp) =>
  list.filter((s) => re.test(s.text)).map((s) => s.path);

describe("copy", () => {
  it("finds source files", () => {
    expect(sources.length).toBeGreaterThan(10);
  });
  it("uses no em or en dashes", () => {
    expect(offenders([...sources, index], /[—–]/)).toEqual([]);
  });
});

describe("unsafe patterns", () => {
  for (const [name, re] of [
    ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/],
    ["console.log", /console\.log/],
    ["innerHTML", /innerHTML/],
    ["eval(", /\beval\(/],
  ] as const) {
    it(`has no ${name}`, () => {
      expect(offenders(sources, re)).toEqual([]);
    });
  }
});

describe("links", () => {
  const allText = sources.map((s) => s.text).join("\n");
  const ids = new Set([...allText.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const INTERNAL = new Set(["/", "/atlas/", "/privacy", "/terms", "/data", "/v1/places", "/#team"]);

  it("every href literal is valid", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const s of tsx) {
      for (const m of s.text.matchAll(/\bhref="([^"]*)"/g)) {
        seen++;
        const h = m[1];
        const ok =
          h !== "" &&
          h !== "#" &&
          ((h.startsWith("#") && ids.has(h.slice(1))) || INTERNAL.has(h) || h.startsWith("https://"));
        if (!ok) bad.push(`${s.path}: ${h}`);
      }
    }
    expect(seen).toBeGreaterThan(5);
    expect(bad).toEqual([]);
  });

  it("every external link has rel=noopener noreferrer", () => {
    const bad: string[] = [];
    for (const s of tsx) {
      for (const m of s.text.matchAll(/<a\b[^>]*?>/gs)) {
        const tag = m[0];
        if (!/\bhref="https:\/\//.test(tag)) continue; // expressions are checked below
        if (!/rel="noopener noreferrer"/.test(tag)) bad.push(`${s.path}: ${tag.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every external link built from an expression has rel=noopener noreferrer", () => {
    const bad: string[] = [];
    for (const s of tsx) {
      for (const m of s.text.matchAll(/<a\b[^>]*?>/gs)) {
        const tag = m[0];
        if (!/\bhref=\{[^}]*(REPO|https:)/.test(tag)) continue;
        if (!/rel="noopener noreferrer"/.test(tag)) bad.push(`${s.path}: ${tag.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the atlas link defaults to /atlas/", () => {
    const t = readFileSync(join(SRC, "components/AtlasLink.tsx"), "utf8");
    expect(t).toMatch(/export const ATLAS\s*=[^;]*\?\?\s*"\/atlas\/"/);
  });
});
