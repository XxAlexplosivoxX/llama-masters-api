import { Layout } from "./Layout";

export function DataSources() {
  return (
    <Layout title="Data sources" updated="2026-11-15">
      <h2>Hotspot data: NASA FIRMS</h2>
      <p>
        Tonalli uses active fire detections from NASA FIRMS (Fire Information for Resource Management System), part of
        NASA&apos;s Land, Atmosphere Near real-time Capability for EOS (LANCE) in NASA&apos;s Earth Science Data and
        Information System (ESDIS). We join these products into one monthly record per country, from 2000 to today:
      </p>
      <ul>
        <li>MODIS Collection 6.1 active fires, from the Terra and Aqua satellites.</li>
        <li>VIIRS 375 m active fires, from the S-NPP, NOAA-20 and NOAA-21 satellites.</li>
      </ul>
      <p>
        Acknowledgment: We acknowledge the use of data and/or imagery from NASA&apos;s Fire Information for Resource
        Management System (FIRMS) (
        <a href="https://earthdata.nasa.gov/firms" rel="noopener noreferrer">
          https://earthdata.nasa.gov/firms
        </a>
        ), part of NASA&apos;s Earth Science Data and Information System (ESDIS).
      </p>
      <p>
        Source and full citation guidance:{" "}
        <a href="https://firms.modaps.eosdis.nasa.gov/" rel="noopener noreferrer">
          firms.modaps.eosdis.nasa.gov
        </a>
        . Detections are thermal anomalies, not confirmed fires. See the <a href="/terms">Terms</a>.
      </p>

      <h2>Boundaries: geoBoundaries</h2>
      <p>
        Country and first-level administrative boundaries come from geoBoundaries (CGAZ ADM1), licensed under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">
          CC BY 4.0
        </a>
        . Source:{" "}
        <a href="https://www.geoboundaries.org/" rel="noopener noreferrer">
          geoboundaries.org
        </a>
        . Boundaries are shown for analysis and do not express any opinion on disputed borders.
      </p>

      <h2>Basemaps in the atlas</h2>
      <ul>
        <li>
          Dark basemap: OpenFreeMap (
          <a href="https://openfreemap.org/" rel="noopener noreferrer">
            openfreemap.org
          </a>
          ), using map data from OpenStreetMap contributors (
          <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer">
            ODbL
          </a>
          ).
        </li>
        <li>
          Satellite and night basemaps: imagery from NASA EOSDIS Global Imagery Browse Services (GIBS), using the Blue
          Marble Shaded Relief Bathymetry and VIIRS Black Marble layers.
        </li>
      </ul>

      <h2>Landing page globe</h2>
      <p>
        The globe uses world-atlas, built from Natural Earth, which is in the public domain. Source:{" "}
        <a href="https://www.naturalearthdata.com/" rel="noopener noreferrer">
          naturalearthdata.com
        </a>
        .
      </p>

      <h2>NASA Space Apps Challenge</h2>
      <p>
        Tonalli was built by the volunteer team llama-masters for the NASA Space Apps Challenge 2026. Tonalli is not
        affiliated with, sponsored by or endorsed by NASA. No NASA insignia is used.
      </p>

      <h2>More</h2>
      <p>
        See the <a href="/privacy">Privacy</a> and <a href="/terms">Terms</a> pages, or return to the{" "}
        <a href="/">home page</a> and the <a href="/atlas/">atlas</a>.
      </p>
    </Layout>
  );
}
