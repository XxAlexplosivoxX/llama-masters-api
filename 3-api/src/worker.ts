// Cloudflare Workers entry: files come from the R2 binding, and successful responses are kept in
// the edge cache, so most requests never reach R2.
import { createApp } from "./app";
import { type R2BucketLike, R2Store } from "./store";

interface Env {
  BUCKET: R2BucketLike;
}

const app = createApp((env) => new R2Store((env as Env).BUCKET));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "GET") return app.fetch(request, env, ctx);
    const cache = caches.default;
    const cached = await cache.match(request); // answers If-None-Match with 304 by itself
    if (cached) return cached;
    const response = await app.fetch(request, env, ctx);
    if (response.status === 200) ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  },
} satisfies ExportedHandler<Env>;
