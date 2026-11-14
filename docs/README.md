# Documentation

- [Data contract](data-contract.md): the exports the API accepts, how they are
  produced, and the rules the API enforces on upload.
- [Challenge](CHALLENGE.md): NASA Space Apps 2026 "MODIS and VIIRS Hot Spots",
  sensor background, harmonization, and solution approaches.
- [Plans](plans/README.md): the [hackathon](plans/HACKATHON_PLAN.md),
  [forecasting](plans/FORECASTING_PLAN.md), and
  [visualization](plans/VISUALIZATION_PLAN.md) plans.
- [References](references/README.md): challenge page and video review, and
  visualization examples.

## Provenance

`CHALLENGE.md`, `plans/` and `references/` are copies from
[llama-masters-research](https://github.com/esauflores/llama-masters-research)
at commit `7502b1d` (2026-11-14). That repo remains the source of truth: update the
documents there and copy them again. The only changes made here are these:
- links to research-only files (`data/README.md`, `data/manifest.json`) now point
  to GitHub;
- the command that fetches the 36 MB `firefly-map.png`, which is not committed, now
  uses this repo's path.
