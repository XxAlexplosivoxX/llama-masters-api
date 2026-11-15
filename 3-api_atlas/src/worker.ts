// Cloudflare Workers entry. API files come from the R2 binding, and successful responses are kept
// in the edge cache, so most requests never reach R2. Every other path is the website (see site.ts).
import { createApp } from "./app";
import { route } from "./site";
import { type R2BucketLike, R2Store } from "./store";

interface Env {
  BUCKET: R2BucketLike;
  ASSETS: Fetcher;
}

const app = createApp((env) => new R2Store((env as Env).BUCKET));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const to = route(url);
    if (to.kind === "redirect") return Response.redirect(new URL(to.location, url).toString(), 301);
    if (to.kind === "asset") {
      const file = await env.ASSETS.fetch(request);
      if (file.status !== 404 || !to.fallback) return file;
      return env.ASSETS.fetch(new Request(new URL(to.fallback, url), request));
    }
    if (request.method !== "GET") return app.fetch(request, env, ctx);
    const cache = caches.default;
    const cached = await cache.match(request); // answers If-None-Match with 304 by itself
    if (cached) return cached;
    const response = await app.fetch(request, env, ctx);
    if (response.status === 200) ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  },
} satisfies ExportedHandler<Env>;
