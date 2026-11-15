# 5-web_landing: tonalli.earth

The landing page at <https://tonalli.earth>: what the project is, the MODIS/VIIRS problem with a live
chart (yearly hotspots for any country, raw MODIS against the harmonized record, read from the API),
the method, the atlas's features and the data sources. The atlas itself (`4-web_atlas/`) is served
next to it at `/atlas/`.

Same stack and palette as the atlas: React, Tailwind, Vite+ (`vp`), Bun.

```sh
bun install
echo "VITE_API_URL=https://llama-masters-api.esauflores.com" > .env.local   # dev against the live API
bun run dev
bun run check        # format, lint, types; `bun run fix` to fix
```

Deployed by `3-api_atlas` (`bun run deploy` there builds both sites into `3-api_atlas/site/`, this
one at the root and the atlas under `atlas/`). `src/assets/atlas.webp` is a screenshot of the atlas
(Brazil); retake it when the atlas looks different.
