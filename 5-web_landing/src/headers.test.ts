/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const text = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const rules = new Map<string, string[]>();
let current: string | null = null;
for (const line of text.split("\n")) {
  if (!line.trim() || line.trim().startsWith("#")) continue;
  if (/^\S/.test(line)) {
    current = line.trim();
    rules.set(current, []);
  } else if (current) rules.get(current)!.push(line.trim());
}
const csp = (path: string) =>
  rules
    .get(path)
    ?.find((l) => l.startsWith("Content-Security-Policy:"))
    ?.slice("Content-Security-Policy:".length)
    .trim();

describe("_headers", () => {
  for (const path of ["/", "/privacy", "/terms", "/data"]) {
    describe(path, () => {
      it("has a strict CSP", () => {
        const p = csp(path);
        expect(p).toBeDefined();
        expect(p).toContain("default-src 'none'");
        expect(p).toContain("frame-ancestors 'none'");
        expect(p).toContain("script-src 'self'");
        const script = p!.split(";").find((d) => d.trim().startsWith("script-src"))!;
        expect(script).not.toContain("'unsafe-inline'");
        expect(p).not.toContain("'unsafe-eval'");
        expect(p).not.toMatch(/(^|[\s;])\*/);
        expect(p).not.toMatch(/\bhttp:/);
      });
    });
  }
  it("leaves the atlas and the API alone", () => {
    for (const path of rules.keys()) {
      expect(path.startsWith("/atlas")).toBe(false);
      expect(path.startsWith("/v1")).toBe(false);
      expect(path).not.toBe("/*");
    }
  });
});
