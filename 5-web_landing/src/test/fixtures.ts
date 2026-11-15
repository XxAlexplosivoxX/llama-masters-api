// Small hand-written payloads in the shape of the real API files (3-api_atlas/fixture/exports).
export const placesPayload = {
  places: [
    {
      id: "venezuela",
      label: "Venezuela",
      iso: ["VEN"],
      bbox: [-73.4, 0.6, -59.8, 12.2],
      version: "v1",
      last_day: "2026-11-10",
    },
    { id: "brazil", label: "Brazil", iso: ["BRA"], bbox: [-74, -34, -34, 5.3], version: "v2", last_day: "2026-11-12" },
  ],
};

/** 24 months from 2000-11: the first 14 reconstructed, the rest observed. */
export function monthlyPayload(n = 24) {
  const ramp = <T>(f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));
  return {
    id: "venezuela",
    label: "Venezuela",
    start_month: "2000-11",
    source: ramp((i) => (i < 14 ? "reconstructed" : "observed")),
    partial: ramp((i) => i === n - 1),
    areas: [
      {
        id: "country",
        series: {
          MODIS: ramp((i) => 100 + i),
          viirs_eq: ramp((i) => 200 + i),
          modis_eq: ramp((i) => 150 + i),
          p10: ramp((i) => 180 + i),
          p90: ramp((i) => 220 + i),
        },
        baseline: { median: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] },
        score: { model: "m1", wape: { m1: 0.25 }, year_rank_spearman: 0.9, band_coverage: 0.8 },
      },
    ],
  };
}

export const recentPayload = { lon: [-60, -61, -62], lat: [-10, -11, -12] };

export function stubApi(): (url: string) => Promise<Response> {
  return (url: string) => {
    const body = url.includes("/monthly") ? monthlyPayload() : url.includes("/recent") ? recentPayload : placesPayload;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
}
