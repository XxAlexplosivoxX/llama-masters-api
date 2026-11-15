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
    title: "When does a country burn?",
    body: "This site combines fire hotspots from NASA's MODIS and VIIRS satellites into one monthly record that starts in 2000. Use it to see a country's fire season, which years burned more, and how now compares. The tour takes about a minute.",
  },
  {
    id: "place",
    target: "place",
    side: "bottom",
    view: "map",
    title: "Start with a country",
    body: "Search by name or code, or browse by continent. Every country with NASA FIRMS data is listed, and everything on screen follows your choice.",
  },
  {
    id: "legend",
    target: "legend",
    side: "top",
    view: "map",
    title: "Read the map",
    body: "Each square is a patch of land, brighter where satellites saw more hotspots in the dates shown. A hotspot is a satellite pixel with an active fire, so it is not a fire count or burned area, and one large fire can count many times.",
  },
  {
    id: "calendar-card",
    target: "calendar-card",
    side: "left",
    view: "map",
    only: "desktop",
    title: "One year at a glance",
    body: "These twelve tiles are the months of one year, shaded by hotspots. Use the arrows to change year, and point at a month to see just that month on the map. Details opens everything else.",
  },
  {
    id: "drawer",
    target: "drawer",
    side: "top",
    only: "mobile",
    title: "Pull the sheet up for details",
    body: "This sheet holds the calendar, key numbers, charts and downloads. Drag the handle up to read more, or down to see more of the map.",
  },
  {
    id: "play",
    target: "play",
    side: "bottom",
    view: "map",
    title: "Watch it burn, month by month",
    body: "Play runs the map through your selected dates like a weather radar loop. Pause, scrub to any month, or speed it up to 4×.",
  },
  {
    id: "layers",
    target: "layers",
    side: "bottom",
    view: "map",
    title: "What is burning now?",
    body: "Switch to Last 7 days to see recent hotspots as dots, coloured by satellite. This data is near-real-time, so it is provisional until the archive replaces it.",
  },
  {
    id: "overview",
    target: "overview",
    side: "left",
    view: "details",
    title: "Choose dates, read the answer",
    body: "Set the period with the month pickers or a quick range. The numbers below follow it: the fire season (the three months with the most hotspots in a typical year), how a year compares with the average, and the total for your dates.",
  },
  {
    id: "calendar",
    target: "calendar",
    side: "left",
    view: "details",
    title: "When does it burn?",
    body: "Each row is a year and each square a month, from dark (few hotspots) to bright (many). Point at a month to see it on the map, click a year to focus it, or drag across months to set the dates. Hatched squares have no satellite data.",
    bodyMobile:
      "Each row is a year and each square a month, from dark (few hotspots) to bright (many). Tap a month to see it on the map, or tap a year to focus it. Hatched squares have no satellite data.",
  },
  {
    id: "anomalies",
    target: "anomalies",
    side: "left",
    view: "details",
    title: "Which years burned more?",
    body: "Each bar compares a year with the average of complete years. Red years burned more than average, blue years less. Select a bar to focus that year everywhere.",
  },
  {
    id: "download",
    target: "download",
    side: "left",
    view: "details",
    title: "Take the data with you",
    body: "Download the monthly counts for your selected dates, or the hotspots of the last 7 days, as CSV files. The monthly file marks partial and provisional months.",
  },
  {
    id: "combined",
    target: "combined",
    side: "left",
    view: "details",
    title: "How two satellites become one record",
    body: "MODIS (since 2000) and VIIRS (since 2012) count hotspots differently, so their raw numbers are never mixed. Older MODIS months are converted to the VIIRS scale and tested against real VIIRS data. You can also view each satellite on its own here.",
  },
  {
    id: "done",
    view: "map",
    title: "You're ready",
    body: "Pick a country, press Play, or point at the calendar to explore. You can replay this tour any time with the question mark button in the toolbar.",
    bodyMobile:
      "Pick a country, press Play, or tap the calendar to explore. You can replay this tour any time with the question mark button in the toolbar.",
  },
];

export function tourStepsFor(desktop: boolean): TourStep[] {
  const device = desktop ? "desktop" : "mobile";
  return TOUR_STEPS.filter((s) => !s.only || s.only === device).map((s) => ({
    ...s,
    body: !desktop && s.bodyMobile ? s.bodyMobile : s.body,
  }));
}
