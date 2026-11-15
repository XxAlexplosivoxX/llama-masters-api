// Single import point for the website's pure logic so the numbers stay identical.
export {
  annualComparison, cellValues, cellsIn, computeStats, coverage, fullRange, gridSeries, harmonizedSource,
  labelOf, latestCompleteYear, localCheck, MIN_BASELINE_YEARS, modisEquivalent, MONTHS, MONTHS_LONG, rankOf, SERIES_LABEL,
  weeklyToMonthly,
} from "../../../website/src/lib/series";
export type { Range, Stats } from "../../../website/src/lib/series";
export { COMING_SOON, fetchHotspots, loadPlace, loadPlaces, usingApi } from "../../../website/src/lib/data";
export type { LoadProgress } from "../../../website/src/lib/data";
export { bboxPolygon } from "../../../website/src/lib/geo";
export { slug } from "../../../website/src/lib/csv";
