# homelab-hub

The notifications hub for **homelab-client** — a small self-hosted webhook
receiver. Services (Radarr, Sonarr, Uptime Kuma, qBittorrent, or anything that
can POST JSON) send it webhooks; it normalises and stores them, and the app
reads them. It replaces funnelling everything through Discord, with no
dependency on an external service.

## Run

### Docker (recommended)

```bash
cp .env.example .env      # set HUB_INGEST_TOKEN and HUB_APP_TOKEN
docker compose up -d
```

The image builds from the [`Dockerfile`](Dockerfile) (multi-stage, `node:22-slim`),
persists the SQLite db to `./data`, and has a healthcheck on `/api/health`. See
[`docker-compose.yml`](docker-compose.yml).

### From source

```bash
cp .env.example .env
npm install
npm run dev               # or: npm run build && npm start
```

## Two tokens

| Token | Direction | Where |
| --- | --- | --- |
| `HUB_INGEST_TOKEN` | services → hub | in the webhook **URL path** |
| `HUB_APP_TOKEN` | app → hub | `Authorization: Bearer …` |

Generate each with `openssl rand -hex 24`.

## Endpoints

- `POST /hook/:token` — webhook sink. `token` must equal `HUB_INGEST_TOKEN`.
  Source, type and level come from the query string or the JSON body.

  ```bash
  curl -X POST "https://hub.example.com/hook/<INGEST_TOKEN>?source=Radarr&type=radarr" \
    -H "Content-Type: application/json" \
    -d '{"title":"Dune: Part Two","message":"Imported · Bluray-2160p","level":"success"}'
  ```

  A bare `text/plain` body is accepted too and taken as the message.

- `GET /api/notifications?since=<id>&limit=<n>` — newest first; `since` returns
  only rows newer than an id the app already holds. Requires the app bearer.

- `GET /api/health` — `{ "ok": true }`.

Real-time (`GET /api/stream`, SSE) and vendor-specific parsers land in later
phases; for now every source works through the generic shape above.

## Behind the reverse proxy

Put it on a subdomain (e.g. `hub.valgrind.cloud`) with an **Authelia bypass on
`^/hook` and `^/api`** — the two tokens are the authentication there, the same
Option B pattern the rest of the stack uses.
