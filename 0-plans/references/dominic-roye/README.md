# Dominic Royé: visualization choices

Reviewed November 14, 2026. Sources: [website](https://dominicroye.github.io/),
[gallery](https://dominicroye.github.io/project/index.html), and the tutorials below.
Local HTML snapshots and selected images preserve reference material. This is
not a copy of the entire website or a runnable copy of its R examples.

## Recommended for the hackathon

### 1. Calendar heatmap — core historical view

Royé's [A heatmap as calendar](https://dominicroye.github.io/blog/calendar-heatmap/index.html)
organizes daily values into monthly calendar panels and distinguishes missing
values. Our adaptation uses **years as rows and ISO weeks as columns**, matching
the planned weekly dataset. A daily/monthly layout is optional only if daily
exports are already available; do not repeat weekly totals in daily cells.

Person 1 defines the legend and missing/partial states; Person 3 implements the
grid. Each cell exposes dates, platform, reported detection count, and source
status. Clicking a cell selects that week's map data if that historical map
extract exists; otherwise display the calendar selection without substituting
recent hotspots. Color represents reported detections with a labeled sequential
scale. Use a shared scale across years for the selected platform, a distinct
missing state, and a partial-week marker. State any log transform explicitly.

### 2. Observed versus seasonal baseline — core comparison

Royé's [Spain temperature normal chart](https://dominicroye.github.io/blog/spain-temperature-normals-openmeteo/index.html)
compares observed values with a seasonal reference and shades the difference.
Our adaptation compares weekly reported detections with the same platform's
historical weekly mean for one selected area. This is a design adaptation, not
reuse of the article's temperature model or reference period.

Person 5 supplies the baseline; Person 3 renders it. Use observed weekly values
and a clearly labeled reference line, optionally shading the difference. Include
a zero baseline for these nonnegative counts. Show reference years and sample
size; exclude partial weeks. With little history, call this a historical average,
not an established climate normal or calibrated danger threshold. Omit smoothing
for the MVP. If a forecast exists, distinguish its origin and future dates; show
an uncertainty band only when actually computed and evaluated.

### 3. Geographic hotspot map — core spatial view

Royé's [Firefly cartography](https://dominicroye.github.io/blog/firefly-maps/index.html)
explores luminous point styling against subdued maps. Our adaptation starts with
small, clearly visible points and quiet boundaries. An optional subtle halo is
styling only: its radius must not imply burned area, spread, or uncertainty.

Person 2 implements the map. Default to one platform with a selector; do not mix
platform counts silently. Preserve geographic locations, provide exact values in
tooltips, and label the available date range. Filter to the selected area before
shipping data to the browser. If point volume is excessive, prepare spatial bins
or clusters with explicit counts rather than drawing the global raw files.

## Optional or deferred

| Reference | Potential application | Two-day decision |
|---|---|---|
| [Grouped circles and small multiples](https://dominicroye.github.io/blog/map-circle-packing/) | Compare platform-specific activity for the same areas and periods | Optional small multiples after core integration; shared extent and scale, separate platform labels. Defer packed-circle layout |
| [Always normalize your data](https://dominicroye.github.io/blog/always-normalize-your-data/index.html) | Reminds us to distinguish totals from rates when comparing different-sized areas | Keep MVP counts explicit. Area-normalized rates require a justified denominator and do not correct sensor sensitivity or observation coverage |
| [Bivariate dasymetric map](https://dominicroye.github.io/blog/bivariate-dasymetric-map/index.html) | Later exploration of two independently supported variables | Defer: requires extra data and a more demanding legend; population-based masking is not appropriate for locating fires |
| [Animation gallery](https://dominicroye.github.io/project/index.html) | Later playback of weekly changes | Defer animation; use a selected week and stable scale first |

These priorities are our project decisions, not recommendations attributed to Royé.

## Team integration and time limits

- Hour 0–1: Person 1 defines the linked map/calendar/comparison layout, labels,
  and colors with Persons 2 and 3. Confirm field names with Persons 4 and 5.
- Hour 1–3: Persons 2 and 3 build against tiny fixtures. Person 4 proves historical
  data processing; Person 5 loads weekly data. No one starts a new chart family.
- Hour 3–8: connect real data and deploy the first usable app. Calendar remains
  a priority over decorative effects or forecasting.
- Day 2: refine labels and interactions; add baseline comparison when supported.
  Add optional comparison panels only after the full demo works. Freeze features
  at cumulative working hour 12.

Shared UI state: selected area, selected platform, selected date/week. The map
must explicitly indicate when its dates differ from the historical calendar.
Historical map linkage is optional if extracts are unavailable; clear date labels
are mandatory. A recent-only fallback is a partial challenge demo and has no
invented annual calendar, seasonal comparison, or current forecast.

## Attribution and reuse

Author: Dominic Royé. The reviewed calendar, firefly, and temperature-normal
tutorials display CC BY-SA 4.0 reuse notices. Preserve the original pages and
notices. Check the specific source and any third-party asset terms before reusing
code or images in a distributed app; cite adaptations and follow applicable
share-alike terms. Link to sources in the demo's methodology/about view.

The example images here are reference material; building an original interface
from prepared FIRMS data avoids treating the author's figures as our own results.
