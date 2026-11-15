# 5-web_landing: tonalli.earth

The landing page at <https://tonalli.earth>. It says what Tonalli is in five screens and sends people to
the atlas (`4-web_atlas/`, served next to it at `/atlas/`). Every number on it is read from the API.

| Screen                      | What it shows                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Hero                        | A globe with the last 7 days of hotspots (`/recent` of every country, thinned per country), turning as the page scrolls |
| Same heat, different counts | One year of one country: what MODIS counted against VIIRS                                                               |
| One scale                   | Yearly hotspots, raw MODIS against the harmonized record, and the leave-one-year-out error                              |
| Hotspot season              | A typical year as twelve month tiles, worst year, peak month, latest month against its median                           |
| Six people                  | The team, each name linked to its LinkedIn profile                                                                      |
| The atlas is live           | The link to the atlas                                                                                                   |

Plus `/privacy`, `/terms` and `/data` (sources and attributions), in `src/legal/`.

Same stack and palette as the atlas: React, Tailwind, Vite+ (`vp`), Bun. The globe is a 2D canvas
(`d3-geo`, land outline from `world-atlas`), not a map library; scroll and entrance motion is `motion`.
With "reduce motion" on, nothing animates.

```sh
bun install
echo "VITE_API_URL=https://llama-masters-api.esauflores.com" > .env.local   # dev against the live API
bun run dev
bun run test         # Vitest: data parsing, globe maths, copy rules, headers, render with the API down
bun run check        # format, lint, types; `bun run fix` to fix
```

From the repository root: `mise run landing:test`.

## Rules the tests hold

- No em or en dashes in any text, no dead links, external links carry `rel="noopener noreferrer"`.
- One button, "Open the atlas"; everything else is a text link.
- What comes from the API is validated in `src/data.ts` before it is drawn.

## Security headers

`public/_headers` (read by Cloudflare) sets a Content-Security-Policy and related headers for the
landing's own paths only. It must not gain a rule for `/atlas/*` or `/v1/*`: the atlas needs map workers
and tile hosts that this policy would block.

Deployed by `3-api_atlas` (`bun run deploy` there builds both sites into `3-api_atlas/site/`, this
one at the root and the atlas under `atlas/`).
