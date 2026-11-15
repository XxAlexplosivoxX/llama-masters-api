import { useEffect, useState } from "react";

export type MapOptions = {
  basemap: "satellite" | "night";
  labels: boolean;
  borders: boolean;
  gridOpacity: number;
  projection: "globe" | "mercator";
};

export const DEFAULT_MAP_OPTIONS: MapOptions = {
  basemap: "satellite",
  labels: true,
  borders: true,
  gridOpacity: 0.82,
  projection: "globe",
};

function readOptions(): MapOptions {
  try {
    const value = JSON.parse(localStorage.getItem("map:options") ?? "null");
    // The Dark basemap was removed from the menu; saved choices move to Satellite.
    if (value?.basemap === "dark") value.basemap = "satellite";
    if (
      value &&
      ["satellite", "night"].includes(value.basemap) &&
      typeof value.labels === "boolean" &&
      typeof value.borders === "boolean" &&
      typeof value.gridOpacity === "number" &&
      Number.isFinite(value.gridOpacity) &&
      value.gridOpacity >= 0.3 &&
      value.gridOpacity <= 1 &&
      ["globe", "mercator"].includes(value.projection)
    ) {
      return {
        basemap: value.basemap,
        labels: value.labels,
        borders: value.borders,
        gridOpacity: value.gridOpacity,
        projection: value.projection,
      };
    }
  } catch {
    /* Storage may be unavailable or contain an older format. */
  }
  return { ...DEFAULT_MAP_OPTIONS };
}

export function useMapOptions() {
  const [options, setOptions] = useState<MapOptions>(readOptions);
  useEffect(() => {
    try {
      localStorage.setItem("map:options", JSON.stringify(options));
    } catch {
      /* Keep the in-memory options. */
    }
  }, [options]);
  return [options, setOptions] as const;
}
