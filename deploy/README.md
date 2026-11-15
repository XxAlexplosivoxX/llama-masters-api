# Deploying on a VPS with Docker

`compose.yaml` runs the API with Caddy in front:
- Caddy serves HTTPS on ports 80 and 443 and gets the certificate itself.
- The SQLite database lives in `deploy/data/` on the host, so it survives
  restarts, rebuilds and redeploys.
- Uploads (`PUT /v1/regions/{name}`, `mise run push`) update the data live, with
  no restart.

## Requirements

- **Machine:** 1 vCPU and 1 GB of RAM are enough. The API used about 150 MB
  while serving and uploading `world`. Building the image needs more, so on 1 GB
  add swap or build elsewhere.
- **Disk:** about 5 GB free. The database is ~350 MB today, and each region keeps
  two versions.
- **Docker** with the Compose plugin.
- **Ports:** 80 and 443 open in the provider's firewall.
- **A name pointing at the VPS:**
  - your own domain with an `A` record; or
  - without a domain, `<ip-with-dashes>.sslip.io`, which resolves to that IP
    (e.g. `203-0-113-7.sslip.io` for 203.0.113.7).

## First deploy

```sh
git clone https://github.com/XxAlexplosivoxX/llama-masters-api.git
cd llama-masters-api
cp deploy/.env.example deploy/.env     # set DOMAIN and API_TOKEN
mkdir -p deploy/data
sudo chown 65532:65532 deploy/data     # the image runs as nonroot (65532)
docker compose -f deploy/compose.yaml up -d --build
curl https://$DOMAIN/healthz           # {"status":"ok","writes_enabled":true}
```

The repository is private, so the VPS needs access to it: a deploy key, or
`gh auth login`.

## Loading the data

The VPS starts empty. There are two ways to fill it.

**Copy the current database.** This is the quickest: everything keeps its
versions. On the machine that runs the API now:

```sh
sqlite3 data/llama.db ".backup llama-backup.db"   # consistent copy while the API runs
scp llama-backup.db user@VPS:llama-masters-api/deploy/data/llama.db
```

Then, on the VPS:

```sh
sudo chown 65532:65532 deploy/data/llama.db
docker compose -f deploy/compose.yaml restart api
```

**Upload each region.** Push each region from the research repo's
`data/processed/`:

```sh
mise run push -- --dir ../llama-masters-research/data/processed/world --url https://$DOMAIN
```

`push` reads `API_TOKEN` from your local `.env`, so it must match the VPS's
`deploy/.env`. The hotspot files are git-ignored, so run this from the machine
that prepared the regions.

## Updating

- **Data:** upload with `push` at any time. The new version takes effect at once
  and the cache is cleared for that region.
- **Code:** `git pull`, then:

  ```sh
  docker compose -f deploy/compose.yaml up -d --build
  ```

  The database in `deploy/data/` is kept.
- **Logs:**

  ```sh
  docker compose -f deploy/compose.yaml logs -f api
  ```

## Backups

Run the same online copy on the VPS. This one runs from a cron job:

```sh
sqlite3 deploy/data/llama.db ".backup backups/llama-$(date +%F).db"
```

Store copies off the VPS too; the database is the only state.

## Notes

- **Upload size:** Caddy does not limit request bodies; the API rejects anything
  over `MAX_UPLOAD_MB`. A CDN or proxy in front, such as the Cloudflare proxy
  (100 MB per request on the free plan), may cut sooner. The largest export,
  `world`, is about 58 MB.
- **Memory:** responses are cached in memory. On a small VPS, keep
  `CACHE_MAX_ENTRIES` and `CACHE_MAX_ITEM_MB` low (`.env.example` uses 128 and 32).
- **Browsers:** set `CORS_ORIGINS` to the website's origin, or keep `*`.
- **Tested locally:** the compose stack was run on a copy of the current
  database. Through Caddy, every region served its version, and the full `world`
  upload took 7 s. Uploads without a token got `401`, and data persisted across
  restarts.
