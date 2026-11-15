import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  calendar,
  highlights,
  jump,
  parseMonthly,
  parsePlaces,
  parseRecent,
  viirsStart,
  yearly,
  type CountryRecord,
} from "./data";
import { monthlyPayload, placesPayload, recentPayload } from "./test/fixtures";

const place = (o: Record<string, unknown> = {}) => ({
  id: "x",
  label: "X",
  iso: ["XXX"],
  bbox: [0, 0, 1, 1],
  version: "v",
  last_day: "2026-01-01",
  ...o,
});

describe("parsePlaces", () => {
  it("accepts a valid list and sorts by label", () => {
    const out = parsePlaces(placesPayload);
    expect(out.map((p) => p.label)).toEqual(["Brazil", "Venezuela"]);
    expect(out[0]).toMatchObject({ id: "brazil", iso: ["BRA"], version: "v2" });
  });
  it("drops invalid entries", () => {
    const out = parsePlaces({
      places: [
        place({ id: "../x" }),
        place({ id: "Brazil" }),
        place({ id: "" }),
        place({ id: "nolabel", label: undefined }),
        place({ id: "badbox", bbox: [1, 2, 3] }),
        place({ id: "nanbox", bbox: [1, 2, 3, NaN] }),
        place({ id: "good-one", label: "Good" }),
      ],
    });
    expect(out.map((p) => p.id)).toEqual(["good-one"]);
  });
  it("throws on bad shapes", () => {
    expect(() => parsePlaces(null)).toThrow();
    expect(() => parsePlaces("x")).toThrow();
    expect(() => parsePlaces({})).toThrow();
    expect(() => parsePlaces({ places: [] })).toThrow();
    expect(() => parsePlaces({ places: [place({ id: "BAD" })] })).toThrow();
  });
});

describe("parseMonthly", () => {
  it("reads the start month", () => {
    const r = parseMonthly(monthlyPayload());
    expect(r.startYear).toBe(2000);
    expect(r.startMonth).toBe(10);
    expect(r.months).toBe(24);
    expect(r.observed[0]).toBe(false);
    expect(r.observed[20]).toBe(true);
    expect(r.partial[23]).toBe(true);
    expect(r.median).toHaveLength(12);
  });
  it("picks the country area even when not first", () => {
    const raw = monthlyPayload(2) as { areas: Record<string, unknown>[] };
    raw.areas = [{ id: "state", series: { viirs_eq: [1, 1] } }, ...raw.areas];
    expect(parseMonthly(raw).harmonized).toEqual([200, 201]);
  });
  it("nulls bad values and fills missing series", () => {
    const raw = {
      start_month: "2001-01",
      source: ["observed", "observed", "observed", "observed"],
      areas: [{ id: "country", series: { viirs_eq: [1, null, -3, NaN] } }],
    };
    // NaN and strings: JSON cannot hold NaN, so build the object directly
    (raw.areas[0].series.viirs_eq as unknown[]).push("7");
    const r = parseMonthly(raw);
    expect(r.harmonized).toEqual([1, null, null, null]);
    expect(r.modis).toEqual([null, null, null, null]);
    expect(r.p10).toHaveLength(4);
    expect(r.modisEq.every((v) => v === null)).toBe(true);
    expect(r.score).toBeNull();
  });
  it("accepts the baseline median only with 12 finite numbers", () => {
    const base = (median: unknown) => {
      const raw = monthlyPayload(2) as { areas: { baseline: unknown }[] };
      raw.areas[0].baseline = { median };
      return parseMonthly(raw).median;
    };
    expect(base(Array(12).fill(1))).toHaveLength(12);
    expect(base(Array(11).fill(1))).toBeNull();
    expect(base(Array(13).fill(1))).toBeNull();
    expect(base([...Array(11).fill(1), NaN])).toBeNull();
    expect(base([...Array(11).fill(1), "1"])).toBeNull();
    expect(base(null)).toBeNull();
  });
  it("takes the score from wape[model]", () => {
    expect(parseMonthly(monthlyPayload(2)).score).toEqual({
      model: "m1",
      wape: 0.25,
      spearman: 0.9,
      bandCoverage: 0.8,
    });
  });
  it("throws on malformed input", () => {
    const ok = monthlyPayload(2);
    expect(() => parseMonthly(null)).toThrow();
    expect(() => parseMonthly({ ...ok, source: undefined })).toThrow();
    expect(() => parseMonthly({ ...ok, start_month: "2000/11" })).toThrow();
    expect(() => parseMonthly({ ...ok, start_month: 5 })).toThrow();
    expect(() => parseMonthly({ ...ok, areas: [] })).toThrow();
    expect(() => parseMonthly({ ...ok, areas: undefined })).toThrow();
  });
});

/** A record of `months` months, all 12 complete unless overridden. */
function rec(over: Partial<CountryRecord> = {}): CountryRecord {
  const months = over.months ?? 24;
  const fill = <T>(v: T) => Array.from({ length: months }, () => v);
  return {
    id: "x",
    label: "X",
    startYear: 2001,
    startMonth: 0,
    months,
    observed: fill(true),
    partial: fill(false),
    modis: fill(10) as (number | null)[],
    harmonized: fill(100) as (number | null)[],
    modisEq: fill(50) as (number | null)[],
    p10: fill(90) as (number | null)[],
    p90: fill(110) as (number | null)[],
    median: null,
    score: null,
    ...over,
  };
}

describe("yearly", () => {
  it("lists complete years with correct sums, ascending", () => {
    const rows = yearly(rec());
    expect(rows.map((r) => r.year)).toEqual([2001, 2002]);
    expect(rows[0]).toMatchObject({
      modis: 120,
      harmonized: 1200,
      modisEq: 600,
      reconstructed: false,
      p10: null,
      p90: null,
    });
  });
  it("excludes a year with a partial month or a null month", () => {
    const partial = rec();
    partial.partial[23] = true;
    expect(yearly(partial).map((r) => r.year)).toEqual([2001]);
    const hole = rec();
    hole.harmonized[3] = null;
    expect(yearly(hole).map((r) => r.year)).toEqual([2002]);
  });
  it("excludes the partial first year of a November start", () => {
    expect(yearly(rec({ startYear: 2000, startMonth: 10, months: 26 })).map((r) => r.year)).toEqual([2001, 2002]);
  });
  it("flags reconstructed only above 6 months, and only then gives a band", () => {
    const six = rec();
    for (let i = 0; i < 6; i++) six.observed[i] = false;
    expect(yearly(six)[0]).toMatchObject({ reconstructed: false, p10: null, p90: null });
    const seven = rec();
    for (let i = 0; i < 7; i++) seven.observed[i] = false;
    expect(yearly(seven)[0]).toMatchObject({ reconstructed: true, p10: 1080, p90: 1320 });
  });
});

describe("viirsStart", () => {
  it("is the year of the first observed month", () => {
    const r = rec({ startYear: 2000, startMonth: 10 });
    r.observed = r.observed.map((_, i) => i >= 3);
    expect(viirsStart(r)).toBe(2001);
  });
  it("is null when nothing is observed", () => {
    expect(viirsStart(rec({ observed: Array(24).fill(false) }))).toBeNull();
  });
});

describe("calendar", () => {
  it("places months for a record starting in November", () => {
    const r = rec({ startYear: 2000, startMonth: 10, months: 5 });
    r.harmonized = [1, 2, 3, 4, 9];
    r.observed = [false, false, true, true, true];
    const c = calendar(r);
    expect(c.years).toEqual([2000, 2001]);
    expect(c.cells[0][10]).toBe(1);
    expect(c.cells[0][11]).toBe(2);
    expect(c.cells[1][0]).toBe(3);
    expect(c.cells[1][1]).toBe(4);
    expect(c.cells[0][9]).toBeNull();
    expect(c.max).toBe(9);
    expect(c.reconstructed[0][10]).toBe(true);
    expect(c.reconstructed[1][0]).toBe(false);
  });
});

describe("highlights", () => {
  const median = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 12];
  it("finds the worst year, the peak month and the current month", () => {
    const r = rec({ median });
    for (let i = 12; i < 24; i++) r.harmonized[i] = 200;
    r.harmonized[22] = 40; // Nov 2002
    r.partial[23] = true; // Dec 2002 is partial, so Nov is the latest complete
    const h = highlights(r);
    expect(h.worstYear?.year).toBe(2001); // 2002 is incomplete
    expect(h.peakMonth).toBe(10);
    expect(h.current).toEqual({ year: 2002, month: 10, value: 40, median: 20, ratio: 2 });
  });
  it("picks the largest complete year", () => {
    const r = rec({ median });
    for (let i = 0; i < 12; i++) r.harmonized[i] = 300;
    expect(highlights(r).worstYear).toEqual({ year: 2001, value: 3600 });
  });
  it("has no current month without a median", () => {
    expect(highlights(rec()).current).toBeNull();
    expect(highlights(rec()).peakMonth).toBeNull();
  });
});

describe("jump", () => {
  it("uses the latest complete observed year with modis > 0", () => {
    const j = jump(rec());
    expect(j).toEqual({ year: 2002, modis: 120, viirs: 1200, times: 10 });
  });
  it("skips years without MODIS counts and reconstructed years", () => {
    const r = rec();
    for (let i = 12; i < 24; i++) r.modis[i] = 0;
    expect(jump(r)?.year).toBe(2001);
    expect(jump(rec({ observed: Array(24).fill(false) }))).toBeNull();
  });
});

describe("parseRecent", () => {
  it("thins evenly to about max", () => {
    const n = 1000;
    const raw = { lon: Array.from({ length: n }, (_, i) => (i % 300) - 150), lat: Array(n).fill(1) };
    const out = parseRecent(raw, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.length).toBeGreaterThan(50);
  });
  it("keeps everything when under max", () => {
    expect(parseRecent(recentPayload, 10)).toHaveLength(3);
  });
  it("drops out-of-range and non-numeric points", () => {
    const out = parseRecent({ lon: [0, 181, "a", 10, null], lat: [0, 0, 0, 91, 5] }, 10);
    expect(out).toEqual([{ lon: 0, lat: 0 }]);
  });
  it("throws on a bad shape", () => {
    expect(() => parseRecent(null, 5)).toThrow();
    expect(() => parseRecent({ lon: [] }, 5)).toThrow();
  });
});

describe("loaders", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  it("loadPlaces rejects on failure and retries later", async () => {
    const data = await import("./data");
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
    await expect(data.loadPlaces()).rejects.toThrow("HTTP 500");
    fetchMock.mockReturnValueOnce(ok(placesPayload));
    expect(await data.loadPlaces()).toHaveLength(2);
    await data.loadPlaces();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loadRecord shares one request per place and uses the versioned URL", async () => {
    const data = await import("./data");
    const p = data.parsePlaces(placesPayload).find((x) => x.id === "venezuela")!;
    fetchMock.mockImplementation(() => ok(monthlyPayload()));
    const [a, b] = await Promise.all([data.loadRecord(p), data.loadRecord(p)]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/places/venezuela/monthly?v=v1");
  });

  it("loadRecord retries after a failure", async () => {
    const data = await import("./data");
    const p = data.parsePlaces(placesPayload)[0];
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 503 }));
    await expect(data.loadRecord(p)).rejects.toThrow();
    await Promise.resolve();
    fetchMock.mockReturnValueOnce(ok(monthlyPayload()));
    expect((await data.loadRecord(p)).months).toBe(24);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
