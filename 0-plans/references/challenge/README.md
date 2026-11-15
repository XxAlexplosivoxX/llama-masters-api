# Challenge page and video review

Reviewed November 14, 2026. Sources:

- [Official challenge](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)
- [Embedded video: 2026 Challenge | Harmonization of MODIS and VIIRS Hot Spots](https://www.youtube.com/watch?v=tEPHsiZtuvk)

## Files and extraction

- `page-source.html`: original downloaded HTML, including Next.js page payloads.
- `details.html` / `details.txt`: challenge details decoded from those payloads.
- `resources.html`: the Resources-tab content extracted from the ChallengePage object.
- `video.en.auto.json`: original YouTube timed-text response for automatic English captions.
- `video.en.auto.txt`: readable timestamped caption segments, not manually corrected.
- `sources.json`: source URLs, publication/retrieval metadata, and source-file checksums.

The visible HTML shell alone omitted the details and resources. The extraction
decoded `self.__next_f.push(...)` JSON and located the `ChallengePage` object,
`detailsContent` payload, and `resourcesTabContent`. The video ID came from the
embedded iframe. yt-dlp discovered the caption tracks; English original-language
automatic captions were retrieved directly from YouTube's timed-text service.
No manual subtitle tracks were listed. Automatic captions may contain errors.
No video/audio was downloaded, and the captions were not checked against audio.

## Findings from the video

| Time | Paraphrased guidance | Implication for us |
|---|---|---|
| [01:07](https://www.youtube.com/watch?v=tEPHsiZtuvk&t=67s) | Combine historical and recent hotspots to examine patterns; a monthly comparison across years is an example | Weekly aggregation is our choice; do not describe it as an official requirement |
| [01:53](https://www.youtube.com/watch?v=tEPHsiZtuvk&t=113s) | Discusses a fire at Chilecito, La Rioja, Argentina, in July 2026 and follow-up imagery | Possible case-study lead, not a linked or downloaded dataset |
| [02:29](https://www.youtube.com/watch?v=tEPHsiZtuvk&t=149s) | Sensor differences complicate historical continuity | Cross-sensor comparability remains central |
| [03:43](https://www.youtube.com/watch?v=tEPHsiZtuvk&t=223s) | Recommends FIRMS and broadly mentions her agency's and other agencies' resources | No additional named dataset, endpoint, or download URL in the English captions |
| [03:56](https://www.youtube.com/watch?v=tEPHsiZtuvk&t=236s) | Separates sensor harmonization from the web calendar | Forecasting and globe styling are extensions rather than substitutes |

The speaker introduces herself as Marina Compagnucci of CONAE in the captions.
Her agency-resource suggestion is broad; it does not establish a requirement to
use a particular CONAE product. The Resources tab currently links only to
[NASA Earthdata FIRMS](https://www.earthdata.nasa.gov/data/tools/firms).

We found no new specific dataset to add to `data/`. The Chilecito example could
be investigated later if Argentina is selected as the demonstration region.
No change to the two-day data scope is warranted solely by this example.

The video frames continuity as the motivation. Do not interpret references to
losing historical information as a claim that archived files will be deleted.
Do not infer that VIIRS itself has the same historical start date as MODIS.
