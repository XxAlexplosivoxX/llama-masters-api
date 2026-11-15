import { Layout } from "./Layout";

export function Terms() {
  return (
    <Layout title="Terms" updated="2026-11-15">
      <h2>Using Tonalli</h2>
      <p>
        Tonalli is a free tool made by the volunteer team llama-masters for the NASA Space Apps Challenge 2026. It is
        for information and research only. By using the site or the API you agree to these terms.
      </p>

      <h2>Not for emergencies</h2>
      <p>
        <strong>Do not use Tonalli for emergency response, evacuation, navigation or any life-safety decision.</strong>{" "}
        Follow your local authorities and official emergency services.
      </p>

      <h2>What the data is</h2>
      <ul>
        <li>Hotspots are satellite thermal anomaly detections. They are not confirmed fires and not burned area.</li>
        <li>Some months are reconstructed. These are estimates and carry uncertainty.</li>
        <li>
          Data can be late, incomplete or wrong. Satellites miss fires, and clouds, smoke and terrain affect detection.
        </li>
        <li>
          Records merge several sensors into one monthly figure per country. Check the <a href="/data">data sources</a>{" "}
          before drawing conclusions.
        </li>
      </ul>

      <h2>No warranty</h2>
      <p>
        Tonalli is provided as is and as available, with no warranty of any kind. We do not promise that it is accurate,
        complete, always online or free of errors.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, the llama-masters team and its contributors are not liable for any loss or damage
        from using or not being able to use Tonalli, or from relying on its data.
      </p>

      <h2>Acceptable use of the API</h2>
      <p>
        The public API under <code>/v1/</code> is open and read-only. Please use it fairly.
      </p>
      <ul>
        <li>Do not overload, scrape aggressively or try to disrupt the service.</li>
        <li>Do not try to break into the service or bypass limits.</li>
        <li>We may rate limit or block traffic, and we may change or remove the API at any time without notice.</li>
      </ul>

      <h2>Intellectual property</h2>
      <p>
        The Tonalli name, design and software belong to their authors. Third-party data and imagery keep their own
        licenses and credits, listed on the <a href="/data">data sources</a> page.
      </p>

      <h2>No affiliation</h2>
      <p>
        Tonalli is not affiliated with, sponsored by or endorsed by NASA. No NASA insignia is used. Tonalli was built
        for the NASA Space Apps Challenge, which is a separate event.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. The date at the top shows the last change. Continued use means you accept them.</p>

      <h2>Contact</h2>
      <p>
        Reach the people behind Tonalli through <a href="/#team">the team section</a>. See also the{" "}
        <a href="/privacy">Privacy</a> page.
      </p>
    </Layout>
  );
}
