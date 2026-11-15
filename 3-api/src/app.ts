// Read-only API over the exports written by 2-process_data (export.py) to <bucket>/exports/.
// Every route maps to one file; nothing is computed per request, so responses cache cleanly.
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { Store } from "./store";

export const PREFIX = "exports";
const PLACE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/; // e.g. brazil, south-america; never a path
const FILES = {
  meta: "meta.json",
  monthly: "monthly.json",
  grid: "monthly_grid.json",
  recent: "recent_hotspots.json",
} as const;
// places.json is the pointer: short-lived, and each entry carries the version (a hash of the files)
// that the site sends as ?v=. A versioned URL never changes content, so it is kept for a year; a new
// export means new URLs. Unversioned requests are cached briefly.
const MAX_AGE = { places: 60, versioned: 31536000, unversioned: 300 } as const;

export function createApp(store: (env: unknown) => Store): Hono {
  const app = new Hono();
  app.use("*", cors({ origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"], exposeHeaders: ["ETag"] }));

  const serve = async (c: Context, key: string, maxAge: number): Promise<Response> => {
    const file = await store(c.env).get(key, c.req.header("If-None-Match"));
    if (!file) return c.json({ error: "not found" }, 404);
    const immutable = maxAge === MAX_AGE.versioned ? ", immutable" : "";
    const headers = {
      ETag: file.etag,
      "Cache-Control": `public, max-age=${maxAge}${immutable}`,
    };
    if (!file.body) return c.body(null, 304, headers);
    return c.body(file.body, 200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
  };

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/v1/places", (c) => serve(c, `${PREFIX}/places.json`, MAX_AGE.places));

  app.get("/v1/places/:id/:file?", async (c) => {
    const id = c.req.param("id");
    const name = (c.req.param("file") ?? "meta") as keyof typeof FILES;
    if (!PLACE_ID.test(id) || !(name in FILES)) return c.json({ error: "not found" }, 404);
    return serve(c, `${PREFIX}/${id}/${FILES[name]}`, c.req.query("v") ? MAX_AGE.versioned : MAX_AGE.unversioned);
  });

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "internal error" }, 500);
  });
  return app;
}
