# llama-masters

Read [CHALLENGE.md](CHALLENGE.md) for the challenge, MODIS/VIIRS background,
harmonization, and possible solution approaches.

Project scope and team schedules are in [0-plans/](0-plans/README.md), including the
[hackathon](0-plans/HACKATHON_PLAN.md),
[forecasting](0-plans/FORECASTING_PLAN.md), and
[visualization](0-plans/VISUALIZATION_PLAN.md) plans.

## Steps

| Step | What | Runs on |
|---|---|---|
| [1-extract_data/](1-extract_data/README.md) | FIRMS archives + area API → `raw/` in R2 | Railway (group `1 · extract`) |
| [2-process_data/](2-process_data/README.md) | `raw/` → `clean/` → aggregates and exports | Railway (group `2 · process`) |
| [3-api/](3-api/README.md) | Hono API serving `exports/` | Cloudflare Workers (Bun locally) |
| [4-web/](4-web/README.md) | Website: calendar, map, charts, CSV (React, Vite+) | Same Worker, static assets |

Railway services are declared in [`.railway/railway.ts`](.railway/railway.ts).

Live: site <https://llama-masters.esauflores.com>, API <https://llama-masters-api.esauflores.com/v1/places>.
Deploy both with `mise run deploy`.

## Data

Data lives in Cloudflare R2, not in git; heavy jobs run on Railway. Nothing is downloaded to
the laptop.

Copy `.env.example` to `.env` and fill in the FIRMS map keys and the R2 credentials;
mise loads it, git ignores it.

## Environment

mise pins Python 3.12.16, uv 0.13.7 and Bun 1.4.4 (the API and the website; `mise run api:test`,
`mise run web:dev`).
uv manages Python dependencies and the project-local `.venv`.

## Setup

With mise installed:

```sh
mise trust
mise install
mise exec -- uv lock
mise run setup
mise run check
```

Commit `mise.toml`, `.python-version`, `pyproject.toml`, and `uv.lock`.
On subsequent checkouts, skip `uv lock`: setup uses the committed lockfile.

## Python

pandas and GeoPandas are included for tabular and geospatial data analysis.

```sh
mise exec -- uv run python
mise exec -- uv run python path/to/script.py
mise exec -- uv add PACKAGE
```

Configure your editor to use `.venv/bin/python`. uv uses the Python installed by
mise; automatic Python downloads by uv are disabled inside the mise environment.

With mise activated in your shell, you can omit `mise exec --` from these commands.

Tooling reference: [uv projects](https://docs.astral.sh/uv/guides/projects/).
