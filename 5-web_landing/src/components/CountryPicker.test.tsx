// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { loadPlaces, loadRecent, loadRecord, parseMonthly, parsePlaces } from "../data";
import { SharedProvider } from "../state";
import { monthlyPayload } from "../test/fixtures";
import { CountryPicker } from "./CountryPicker";

vi.mock("../data", async (original) => ({
  ...(await original<typeof import("../data")>()),
  loadPlaces: vi.fn(),
  loadRecord: vi.fn(),
  loadRecent: vi.fn(),
}));

const places = parsePlaces({
  places: [
    ["brazil", "Brazil", "BRA"],
    ["algeria", "Algeria", "DZA"],
    ["cote-d-ivoire", "Côte d'Ivoire", "CIV"],
    ["japan", "Japan", "JPN"],
    ["france", "France", "FRA"],
    ["guatemala", "Guatemala", "GTM"],
    ["jamaica", "Jamaica", "JAM"],
    ["australia", "Australia", "AUS"],
    ["antarctica", "Antarctica", "ATA"],
    ["unlisted", "Unlisted country", "XXX"],
  ].map(([id, label, iso]) => ({ id, label, iso: [iso], bbox: [0, 0, 1, 1], version: "v1", last_day: "2026-11-12" })),
});

beforeEach(() => {
  vi.mocked(loadPlaces).mockResolvedValue(places);
  vi.mocked(loadRecent).mockResolvedValue([]);
  vi.mocked(loadRecord).mockImplementation(async (p) => ({
    ...parseMonthly(monthlyPayload()),
    id: p.id,
    label: p.label,
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function pickers() {
  render(
    <SharedProvider>
      <CountryPicker />
      <CountryPicker />
      <a href="/atlas/">Open the atlas</a>
    </SharedProvider>,
  );
  return screen.findAllByRole("button", { name: "Brazil" });
}

function highlighted() {
  const id = screen.getByRole("combobox").getAttribute("aria-activedescendant");
  return id ? document.getElementById(id)?.textContent : null;
}

describe("CountryPicker", () => {
  it("groups every continent and searches all labels and ISO codes", async () => {
    const [trigger] = await pickers();
    fireEvent.click(trigger);
    for (const [continent, country] of [
      ["Africa", "Côte d'Ivoire"],
      ["Asia", "Japan"],
      ["Europe", "France"],
      ["North & Central America", "Guatemala"],
      ["Caribbean", "Jamaica"],
      ["South America", "Brazil"],
      ["Oceania", "Australia"],
      ["Antarctica", "Antarctica"],
      ["Other", "Unlisted country"],
    ]) {
      expect(
        within(screen.getByRole("group", { name: continent })).getByRole("option", { name: country }),
      ).toBeTruthy();
    }
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "  jPn  " } });
    expect(screen.getAllByRole("option").map((p) => p.textContent)).toEqual(["Japan"]);
    fireEvent.change(search, { target: { value: "cote" } });
    expect(screen.getAllByRole("option").map((p) => p.textContent)).toEqual(["Côte d'Ivoire"]);
    fireEvent.change(search, { target: { value: "no such country" } });
    expect(screen.getByRole("status").textContent).toBe("No country by that name.");
    expect(highlighted()).toBeNull();
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "Brazil" })).toHaveLength(2);
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getAllByRole("group")).toHaveLength(9);
    expect(screen.getAllByRole("option")).toHaveLength(places.length);
  });

  it("navigates groups by keyboard and shares a selection between both pickers", async () => {
    const [trigger] = await pickers();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const search = screen.getByRole("combobox");
    expect(document.activeElement).toBe(search);
    expect(highlighted()).toBe("Brazil");
    fireEvent.keyDown(search, { key: "Home" });
    expect(highlighted()).toBe("Algeria");
    fireEvent.keyDown(search, { key: "ArrowUp" });
    expect(highlighted()).toBe("Algeria");
    fireEvent.keyDown(search, { key: "End" });
    expect(highlighted()).toBe("Unlisted country");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(highlighted()).toBe("Unlisted country");
    fireEvent.keyDown(search, { key: "ArrowUp" });
    expect(highlighted()).toBe("Antarctica");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    const updated = screen.getAllByRole("button", { name: "Antarctica" });
    expect(updated).toHaveLength(2);
    fireEvent.click(updated[1]);
    expect(screen.getByRole("option", { name: "Antarctica" }).getAttribute("aria-selected")).toBe("true");
    expect(highlighted()).toBe("Antarctica");
    fireEvent.click(screen.getByRole("option", { name: "Guatemala" }));
    expect(screen.getAllByRole("button", { name: "Guatemala" })).toHaveLength(2);
    expect(document.activeElement).toBe(updated[1]);
  });

  it("returns focus on Escape and closes when focus or a pointer leaves", async () => {
    const [trigger] = await pickers();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    const link = screen.getByRole("link", { name: "Open the atlas" });
    act(() => link.focus());
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(link);
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("scrolls the current option and keyboard moves inside the list only", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") === "listbox") return new DOMRect(0, 100, 296, 180);
      if (this.getAttribute("role") === "option") {
        const list = this.closest<HTMLElement>('[role="listbox"]')!;
        const index = [...list.querySelectorAll('[role="option"]')].indexOf(this);
        return new DOMRect(0, 100 + index * 44 - list.scrollTop, 296, 44);
      }
      return new DOMRect();
    });
    const scrollPage = vi.spyOn(window, "scrollTo");
    const [trigger] = await pickers();
    fireEvent.click(trigger);
    const list = screen.getByRole("listbox");
    expect(list.scrollTop).toBeGreaterThan(0);
    const selected = screen.getByRole("option", { name: "Brazil" }).getBoundingClientRect();
    expect(selected.top).toBeGreaterThanOrEqual(list.getBoundingClientRect().top);
    expect(selected.bottom).toBeLessThanOrEqual(list.getBoundingClientRect().bottom);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Home" });
    expect(list.scrollTop).toBe(0);
    list.scrollTop = 88;
    fireEvent.scroll(list);
    expect(list.scrollTop).toBe(88);
    expect(scrollPage).not.toHaveBeenCalled();
  });

  it("keeps the panel within a phone viewport when the keyboard changes its size", async () => {
    const viewport = Object.assign(new EventTarget(), { width: 320, height: 640, offsetTop: 0, offsetLeft: 0 });
    vi.stubGlobal("visualViewport", viewport);
    const [trigger] = await pickers();
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(260, 580, 48, 44));
    fireEvent.click(trigger);
    const panel = screen.getByRole("listbox").parentElement!;
    const fits = () => {
      const left = Number.parseFloat(panel.style.left);
      const width = Number.parseFloat(panel.style.width);
      const anchor = Number.parseFloat(panel.style.top);
      const height = Number.parseFloat(panel.style.maxHeight);
      const top = panel.style.transform ? anchor - height : anchor;
      expect(left).toBeGreaterThanOrEqual(viewport.offsetLeft + 12);
      expect(left + width).toBeLessThanOrEqual(viewport.offsetLeft + viewport.width - 12);
      expect(top).toBeGreaterThanOrEqual(viewport.offsetTop + 12);
      expect(top + height).toBeLessThanOrEqual(viewport.offsetTop + viewport.height - 12);
    };
    fits();
    viewport.height = 300;
    viewport.offsetTop = 80;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    fits();
  });
});
