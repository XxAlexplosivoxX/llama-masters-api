import { Layout } from "./Layout";

export function Privacy() {
  return (
    <Layout title="Privacy" updated="2026-11-15">
      <h2>Short version</h2>
      <p>
        Tonalli is a free, read-only website. It has no accounts, forms, ads or trackers. We do not ask for your
        personal data and we do not collect it on purpose.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>No cookies.</li>
        <li>No analytics, advertising or tracking scripts.</li>
        <li>No sale or sharing of data. We have no user data to sell.</li>
      </ul>
      <p>
        Because there are no cookies or trackers, there is no consent banner. None is needed for the storage described
        below.
      </p>

      <h2>What is stored in your browser</h2>
      <p>
        The <a href="/atlas/">atlas</a> saves a few display preferences in your browser using <code>localStorage</code>.
        This data stays on your device and is never sent to us.
      </p>
      <ul>
        <li>
          <code>map:metric</code> and <code>map:unit</code>: whether the map shows hotspot counts or temperature, and
          the temperature unit.
        </li>
        <li>
          <code>map:options</code>: your map display options.
        </li>
        <li>
          <code>calendar:open</code>: whether the calendar panel is open.
        </li>
      </ul>
      <p>You can clear this at any time from your browser settings. The atlas still works without it.</p>

      <h2>Infrastructure and logs</h2>
      <p>
        The site and its API run on Cloudflare (Workers and R2). Like any web host, Cloudflare processes technical data
        such as your IP address, request URL, browser type and time of request, to deliver the site, keep it secure and
        limit abuse. We do not add our own tracking on top of this. See{" "}
        <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener noreferrer">
          Cloudflare&apos;s privacy policy
        </a>
        .
      </p>

      <h2>Third-party map servers</h2>
      <p>
        When you open the atlas, your browser requests map images directly from these hosts. They see your IP address.
      </p>
      <ul>
        <li>
          <code>tiles.openfreemap.org</code>: the dark basemap (OpenFreeMap, built on OpenStreetMap data).
        </li>
        <li>
          <code>gibs.earthdata.nasa.gov</code>: the satellite and night basemaps (NASA GIBS).
        </li>
      </ul>
      <p>We do not control these services. Each has its own privacy practices.</p>

      <h2>Children</h2>
      <p>
        Tonalli is not directed at children and does not collect personal data from anyone, including children under 13.
      </p>

      <h2>Changes</h2>
      <p>We may update this page. The date at the top shows the last change.</p>

      <h2>Contact</h2>
      <p>
        Questions? Reach the people behind Tonalli through <a href="/#team">the team section</a>. See also the{" "}
        <a href="/terms">Terms</a> and <a href="/data">Data sources</a>.
      </p>
    </Layout>
  );
}
