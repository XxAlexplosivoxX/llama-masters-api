import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { FileStore } from "../src/file-store";
import { type R2BucketLike, R2Store } from "../src/store";

const app = createApp(() => new FileStore(`${import.meta.dir}/../fixture`));
const get = (path: string, headers?: Record<string, string>) => app.request(path, { headers });

describe("routes", () => {
  test("health", async () => {
    const res = await get("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("places list", async () => {
    const res = await get("/v1/places");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).places[0].id).toBe("venezuela");
  });

  test.each([
    ["/v1/places/venezuela", "id", "venezuela"],
    ["/v1/places/venezuela/meta", "id", "venezuela"],
    ["/v1/places/venezuela/monthly", "start_month", "2026-01"],
    ["/v1/places/venezuela/grid", "cell_deg", 0.1],
    ["/v1/places/venezuela/recent", "synthetic", true],
  ])("%s", async (path, field, value) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect((await res.json())[field]).toBe(value);
  });

  test("cache headers: long for history, short for recent points", async () => {
    expect((await get("/v1/places")).headers.get("cache-control")).toBe("public, max-age=60");
    expect((await get("/v1/places/venezuela/monthly")).headers.get("cache-control")).toBe("public, max-age=300");
    expect((await get("/v1/places/venezuela/monthly?v=abc123")).headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test("CORS for any origin", async () => {
    const res = await get("/v1/places", { Origin: "https://example.org" });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("conditional requests", () => {
  test("matching If-None-Match gets 304 without a body", async () => {
    const first = await get("/v1/places/venezuela/grid");
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const again = await get("/v1/places/venezuela/grid", { "If-None-Match": etag ?? "" });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  test("stale ETag gets the file", async () => {
    const res = await get("/v1/places/venezuela/grid", { "If-None-Match": '"stale"' });
    expect(res.status).toBe(200);
  });
});

describe("not found and unsafe ids", () => {
  test.each([
    "/v1/places/atlantis",
    "/v1/places/venezuela/weekly",
    "/v1/places/Venezuela",
    "/v1/places/..%2Fsecrets",
    "/v1/places/a--b",
    "/v1/places/-x",
    "/nope",
  ])("%s -> 404", async (path) => {
    expect((await get(path)).status).toBe(404);
  });
});

describe("R2 store", () => {
  // Fake binding with R2's onlyIf behaviour: a matching ETag returns the object without a body.
  const objects: Record<string, string> = { "exports/places.json": '{"places":[]}' };
  const bucket: R2BucketLike = {
    async get(key, options) {
      if (!(key in objects)) return null;
      const meta = { httpEtag: '"abc"', size: objects[key].length };
      if (options?.onlyIf?.etagDoesNotMatch === "abc") return meta;
      return { ...meta, body: new Response(objects[key]).body ?? undefined };
    },
  };
  const r2app = createApp(() => new R2Store(bucket));

  test("serves objects and answers 304 from onlyIf", async () => {
    const ok = await r2app.request("/v1/places");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("etag")).toBe('"abc"');
    const not = await r2app.request("/v1/places", { headers: { "If-None-Match": '"abc"' } });
    expect(not.status).toBe(304);
    expect((await r2app.request("/v1/places/brazil")).status).toBe(404);
  });
});
