// Where a request for the website goes. tonalli.earth is the home: the landing page (5-web_landing)
// at /, the atlas (4-web_atlas) at /atlas/. The older addresses send people there, keeping the path.

/** The address the website lives at. */
export const HOME = "tonalli.earth";

/** Hosts that used to serve the atlas at their root: their pages move under /atlas/ on HOME. */
const ATLAS_HOSTS = new Set(["atlas.tonalli.earth", "llama-masters.esauflores.com"]);
/** The API host keeps the API; anything else on it goes to the landing page. */
const API_HOSTS = new Set(["llama-masters-api.esauflores.com"]);

export type SiteRoute =
  | { kind: "redirect"; location: string }
  | { kind: "api" }
  | { kind: "asset"; fallback: string | null }; // fallback: the page to serve when the file is missing

export function isApiPath(path: string): boolean {
  return path.startsWith("/v1/") || path === "/healthz";
}

export function route(url: URL): SiteRoute {
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1"; // wrangler dev
  if (url.protocol === "http:" && !local) {
    const to = new URL(url);
    to.protocol = "https:";
    return { kind: "redirect", location: to.toString() };
  }
  if (isApiPath(url.pathname)) return { kind: "api" };
  if (ATLAS_HOSTS.has(url.hostname)) {
    return { kind: "redirect", location: `https://${HOME}/atlas${url.pathname}${url.search}${url.hash}` };
  }
  if (API_HOSTS.has(url.hostname)) {
    return { kind: "redirect", location: `https://${HOME}${url.pathname}${url.search}` };
  }
  if (url.pathname === "/atlas") return { kind: "redirect", location: `/atlas/${url.search}` };
  // The atlas is a one-page app: unknown paths under /atlas/ get its page.
  if (url.pathname.startsWith("/atlas/")) return { kind: "asset", fallback: "/atlas/" };
  return { kind: "asset", fallback: null };
}
