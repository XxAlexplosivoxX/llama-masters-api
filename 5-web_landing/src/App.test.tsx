// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "./App";
import { stubApi } from "./test/fixtures";

const at = (path: string) => window.history.replaceState(null, "", path);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  at("/");
});

describe("landing", () => {
  it("renders with the API down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("down"))),
    );
    at("/");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("One record.");
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/atlas/");
    expect(links.length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByText(/could not be loaded/).length).toBeGreaterThan(0));
  });

  it("renders the scenes with data", async () => {
    vi.stubGlobal("fetch", vi.fn(stubApi()));
    at("/");
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Same heat\./ })).toBeTruthy());
    expect(screen.getByRole("heading", { name: /The atlas is/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/countries/, { selector: "p" })).toBeTruthy());
  });
});

describe("static pages", () => {
  for (const [path, title] of [
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/data", "Data sources"],
  ] as const) {
    it(`${path} shows ${title}`, () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.reject(new Error("unused"))),
      );
      at(path);
      render(<App />);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    });
  }
});
