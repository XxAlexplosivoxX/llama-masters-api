/** Tour copy and targets. Edit freely: targets are `data-tour` attributes in the UI. */
export type TourSide = "top" | "bottom" | "left" | "right";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Replaces `body` on phones. */
  bodyMobile?: string;
  /** `data-tour` value of the element to highlight; none = centred card. */
  target?: string;
  side?: TourSide;
  only?: "desktop" | "mobile";
  /** Desktop only: open ("details") or close ("map") the details panel. */
  view?: "map" | "details";
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    view: "map",
    title: "Welcome to Tonalli ATLAS",
    body: "An atlas of satellite fire hotspots: NASA's MODIS and VIIRS joined into one monthly record per country, from 2000 to today. This tour shows the controls in about a minute.",
  },
  {
    id: "name",
    view: "map",
    title: "Why Tonalli ATLAS?",
    body: "Tonalli is a Nawat word of the Pipil people for the sun and its fire, and for the count of days and nights, the calendar. ATLAS: Analytics, Tracking & Logging Archive for Satellites, a collection of maps of the whole world.",
  },
  {
    id: "brand",
    target: "brand",
    side: "bottom",
    view: "map",
    title: "Home page",
    body: "Select the name to go back to the Tonalli home page, with the method and data sources.",
    bodyMobile: "Tap the sun to go back to the Tonalli home page, with the method and data sources.",
  },
  {
    id: "place",
    target: "place",
    side: "bottom",
    view: "map",
    title: "Choose a country",
    body: "Search by name or code, or filter by continent. Global lets you combine several countries.",
  },
  {
    id: "area",
    target: "area",
    side: "bottom",
    view: "map",
    title: "Select an area",
    body: "Draw a rectangle or a shape on the map, or type coordinates, to see only that area.",
  },
  {
    id: "record",
    target: "record",
    side: "top",
    view: "map",
    title: "Pick the satellite record",
    body: "Harmonized puts both satellites on one scale. MODIS or VIIRS show a single sensor.",
    bodyMobile: "Tap the record name to switch between Harmonized (both satellites on one scale), MODIS and VIIRS.",
  },
  {
    id: "play",
    target: "play",
    side: "bottom",
    view: "map",
    title: "Play the timeline",
    body: "Press Play to run the map month by month, then pause or scrub.",
  },
  {
    id: "layers",
    target: "layers",
    side: "bottom",
    view: "map",
    title: "Switch the layer",
    body: "History shows monthly hotspots since 2000. Last 7 days shows each hotspot from the past week.",
  },
  {
    id: "map-options",
    target: "map-options",
    side: "bottom",
    view: "map",
    title: "Style the map",
    body: "Change the basemap, names, borders, opacity and projection, or colour the map by fire temperature.",
  },
  {
    id: "year",
    target: "calendar-card",
    side: "left",
    view: "map",
    only: "desktop",
    title: "Browse a year",
    body: "Use the arrows or the year label to change year. Point at a month to see it on the map.",
  },
  {
    id: "details",
    target: "details",
    side: "left",
    view: "map",
    only: "desktop",
    title: "Open Details",
    body: "Details has the full calendar, charts and downloads. Next opens it for you.",
  },
  {
    id: "sheet",
    target: "drawer",
    side: "top",
    only: "mobile",
    title: "Open the sheet",
    body: "Drag the handle up for the calendar and charts, down for the map.",
  },
  {
    id: "calendar",
    target: "calendar",
    side: "left",
    view: "details",
    title: "Pick your dates",
    body: "Each square is a month, each row a year. Drag across months to set the dates; click a year to focus it.",
    bodyMobile: "Each square is a month, each row a year. Tap a month to see it on the map, or a year to focus it.",
  },
  {
    id: "years",
    target: "anomalies",
    side: "left",
    view: "details",
    title: "Compare years",
    body: "Red years had more hotspots than average, blue fewer. Select a bar to focus that year.",
  },
  {
    id: "download",
    target: "download",
    side: "left",
    view: "details",
    title: "Export the data",
    body: "Download monthly counts or last-7-days hotspots as CSV.",
  },
  {
    id: "done",
    target: "tour-button",
    side: "bottom",
    view: "map",
    title: "You're set",
    body: "Replay the Tonalli ATLAS tour any time from this button.",
  },
];

export function tourStepsFor(desktop: boolean): TourStep[] {
  const device = desktop ? "desktop" : "mobile";
  return TOUR_STEPS.filter((s) => !s.only || s.only === device).map((s) => ({
    ...s,
    body: !desktop && s.bodyMobile ? s.bodyMobile : s.body,
  }));
}
