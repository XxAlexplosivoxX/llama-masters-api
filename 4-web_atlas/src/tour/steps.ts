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
    title: "Explore burning activity",
    body: "A 30-second tour of the controls.",
  },
  {
    id: "place",
    target: "place",
    side: "bottom",
    view: "map",
    title: "Switch country",
    body: "Search by name or code, filter by continent, or pick Global to combine countries.",
  },
  {
    id: "area",
    target: "area",
    side: "bottom",
    view: "map",
    title: "Select an area",
    body: "Draw a rectangle or a shape on the map, or type coordinates.",
  },
  {
    id: "record",
    target: "record",
    side: "top",
    view: "map",
    title: "Switch the record",
    body: "Show the map as Harmonized, MODIS only or VIIRS only.",
    bodyMobile: "Tap the record name to switch between Harmonized, MODIS and VIIRS.",
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
    body: "History shows past months. Last 7 days shows recent hotspots.",
  },
  {
    id: "map-options",
    target: "map-options",
    side: "bottom",
    view: "map",
    title: "Style the map",
    body: "Change the basemap, labels, borders, opacity and projection, or colour by temperature.",
  },
  {
    id: "year",
    target: "calendar-card",
    side: "left",
    view: "map",
    only: "desktop",
    title: "Browse a year",
    body: "Use the arrows or the year label to change year, and point at a month to preview it on the map.",
  },
  {
    id: "details",
    target: "details",
    side: "left",
    view: "map",
    only: "desktop",
    title: "Open Details",
    body: "Select Details for dates, charts and downloads. Next opens it for you.",
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
    body: "Drag across months to set the dates. Click a year to focus it.",
    bodyMobile: "Tap a month to preview it. Tap a year to focus it.",
  },
  {
    id: "years",
    target: "anomalies",
    side: "left",
    view: "details",
    title: "Compare years",
    body: "Select a bar to focus that year. Red is above average, blue below.",
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
    body: "Replay this tour any time from this button.",
  },
];

export function tourStepsFor(desktop: boolean): TourStep[] {
  const device = desktop ? "desktop" : "mobile";
  return TOUR_STEPS.filter((s) => !s.only || s.only === device).map((s) => ({
    ...s,
    body: !desktop && s.bodyMobile ? s.bodyMobile : s.body,
  }));
}
