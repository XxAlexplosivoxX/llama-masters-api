/** Tour copy and targets. Edit freely: targets are `data-tour` attributes in the UI. */
export type TourSide = "top" | "bottom" | "left" | "right";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Replaces `body` on phones. */
  bodyMobile?: string;
  /** `data-tour` values to highlight, space-separated: the first must exist, the rest widen the spotlight. None = centred card. */
  target?: string;
  side?: TourSide;
  only?: "desktop" | "mobile";
  /** Desktop only: open ("details") or close ("map") the details panel. */
  view?: "map" | "details";
  /** Popover opened during the step (`useTourDemo`); desktop only unless `demoMobile`. */
  demo?: string;
  demoMobile?: boolean;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    view: "map",
    title: "Welcome to Tonalli ATLAS",
    body: "NASA fire hotspots from MODIS and VIIRS, on one scale since 2000.",
  },
  {
    id: "name",
    view: "map",
    title: "Why the name?",
    body: "Tonalli: Pipil (Nahuat) for sun, fire and the count of days. ATLAS: Analytics, Tracking & Logging Archive for Satellites.",
  },
  {
    id: "brand",
    target: "brand",
    side: "bottom",
    view: "map",
    title: "Home",
    body: "Back to the Tonalli home page.",
  },
  {
    id: "place",
    target: "place place-menu",
    side: "right",
    view: "map",
    demo: "place",
    title: "Choose a country",
    body: "Search, filter by continent, or pick Global.",
  },
  {
    id: "area",
    target: "area area-menu",
    side: "left",
    view: "map",
    demo: "area",
    title: "Select an area",
    body: "Draw a rectangle or shape, or type coordinates.",
  },
  {
    id: "record",
    target: "record",
    side: "top",
    view: "map",
    demo: "record",
    demoMobile: true,
    title: "Satellite record",
    body: "Harmonized joins both satellites. MODIS or VIIRS show one.",
  },
  {
    id: "play",
    target: "play",
    side: "bottom",
    view: "map",
    title: "Play",
    body: "Watch the map month by month.",
  },
  {
    id: "layers",
    target: "layers",
    side: "bottom",
    view: "map",
    title: "Layer",
    body: "Monthly history, or the last 7 days.",
  },
  {
    id: "map-options",
    target: "map-options map-options-menu",
    side: "left",
    view: "map",
    demo: "map-options",
    title: "Map options",
    body: "Basemap, names, borders, temperature and more.",
  },
  {
    id: "year",
    target: "calendar-card year-picker",
    side: "left",
    view: "map",
    only: "desktop",
    demo: "year",
    title: "Browse a year",
    body: "Pick a year. Point at a month to map it.",
  },
  {
    id: "details",
    target: "details",
    side: "left",
    view: "map",
    only: "desktop",
    title: "Details",
    body: "Full calendar, charts and downloads.",
  },
  {
    id: "sheet",
    target: "drawer",
    side: "top",
    only: "mobile",
    title: "Details",
    body: "Drag up for the calendar and charts.",
  },
  {
    id: "calendar",
    target: "calendar",
    side: "left",
    view: "details",
    title: "Pick dates",
    body: "Drag across months. Click a year to focus it.",
    bodyMobile: "Tap a month to map it, a year to focus it.",
  },
  {
    id: "years",
    target: "anomalies",
    side: "left",
    view: "details",
    title: "Compare years",
    body: "Red: above average. Blue: below.",
  },
  {
    id: "download",
    target: "download",
    side: "left",
    view: "details",
    title: "Download",
    body: "Monthly counts or recent hotspots, as CSV.",
  },
  {
    id: "done",
    target: "tour-button",
    side: "bottom",
    view: "map",
    title: "All set",
    body: "Replay the tour from here.",
  },
];

export function tourStepsFor(desktop: boolean): TourStep[] {
  const device = desktop ? "desktop" : "mobile";
  return TOUR_STEPS.filter((s) => !s.only || s.only === device).map((s) => ({
    ...s,
    body: !desktop && s.bodyMobile ? s.bodyMobile : s.body,
    demo: desktop || s.demoMobile ? s.demo : undefined,
  }));
}
