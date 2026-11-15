import { describe, expect, test } from "bun:test";
import { route } from "../src/site";

const r = (u: string) => route(new URL(u));

describe("website routes", () => {
  test("plain http goes to https", () => {
    expect(r("http://tonalli.earth/atlas/?x=1")).toEqual({ kind: "redirect", location: "https://tonalli.earth/atlas/?x=1" });
  });
  test("landing and atlas on tonalli.earth", () => {
    expect(r("https://tonalli.earth/")).toEqual({ kind: "asset", fallback: null });
    expect(r("https://tonalli.earth/atlas/assets/a.js")).toEqual({ kind: "asset", fallback: "/atlas/" });
    expect(r("https://tonalli.earth/atlas")).toEqual({ kind: "redirect", location: "/atlas/" });
  });
  test("old atlas addresses move under /atlas/", () => {
    expect(r("https://atlas.tonalli.earth/")).toEqual({ kind: "redirect", location: "https://tonalli.earth/atlas/" });
    expect(r("https://llama-masters.esauflores.com/x?y=1")).toEqual({
      kind: "redirect",
      location: "https://tonalli.earth/atlas/x?y=1",
    });
  });
  test("the API answers on every host", () => {
    for (const host of ["tonalli.earth", "atlas.tonalli.earth", "llama-masters-api.esauflores.com"]) {
      expect(r(`https://${host}/v1/places`)).toEqual({ kind: "api" });
    }
    expect(r("https://llama-masters-api.esauflores.com/")).toEqual({ kind: "redirect", location: "https://tonalli.earth/" });
  });
  test("workers.dev and local dev serve the site directly", () => {
    expect(r("http://localhost:8787/atlas/")).toEqual({ kind: "asset", fallback: "/atlas/" });
    expect(r("https://llama-masters-api.redesinformaticas.workers.dev/")).toEqual({ kind: "asset", fallback: null });
  });
});
