# Deploying Stage Ready

Stage Ready runs as three Node processes, a Python service on Modal, and four managed backing services. Any host that runs Node 22 with long-lived processes and WebSockets works (a VM, Fly.io, Railway, Render). The web app can also go on Vercel; the realtime server and the worker cannot, since they hold WebSockets and a job queue open.

| Piece                     | What it is                                               | Suggested home                                      |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `apps/web`                | Next.js 15 (UI and REST API), port 3000                  | Vercel, or any Node host                            |
| `apps/realtime`           | Fastify WebSocket server, port 4000                      | Any Node host with WebSockets                       |
| `apps/worker`             | BullMQ job worker, health on 4100                        | Any Node host (no public port needed)               |
| `services/vision`         | FastAPI: faster-whisper, FFmpeg renders, take thumbnails | Modal (`services/vision/modal_app.py`, L4 GPU)      |
| Postgres 16 with pgvector | Everything stored                                        | Neon, Supabase, RDS (enable the `vector` extension) |
| Redis 7                   | Job queue and realtime state                             | Upstash (TCP, not REST), Redis Cloud, ElastiCache   |
| S3-compatible storage     | Recordings, takes, slides, renders                       | Cloudflare R2 or S3                                 |
| Meta Model API            | Muse Spark, Muse Wonder, Muse Image, SAM 3.1             | Already hosted; you only need the key               |

## 1. Backing services

1. **Postgres.** Create a database, enable `vector` (`CREATE EXTENSION IF NOT EXISTS vector;`; `pnpm db:migrate` does this too when the role is allowed to) and copy the connection string into `DATABASE_URL`.
2. **Redis.** Copy the `redis://` or `rediss://` URL into `REDIS_URL`. BullMQ needs a real Redis connection; HTTP-only Redis APIs do not work.
3. **Storage.** Create a bucket and an access key with read and write on it. Fill `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and `S3_REGION` (`auto` for R2). The endpoint must be reachable from the internet: browsers upload recordings with presigned PUTs, and the Modal service downloads takes and uploads renders with presigned URLs. Add a CORS rule to the bucket so the browser can upload:

   ```json
   [{ "AllowedOrigins": ["https://app.example.com"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```

## 2. The vision service on Modal

```bash
pip install modal
```

```bash
modal token new
```

```bash
modal secret create stage-ready-vision VISION_SERVICE_TOKEN=$(openssl rand -hex 24)
```

```bash
modal deploy services/vision/modal_app.py
```

Put the printed URL in `VISION_SERVICE_URL` and the same token in `VISION_SERVICE_TOKEN`. Modal may run several containers: renders mirror their status to storage, so a status poll that reaches another container still gets an answer (see `docs/decisions/0006-m6-decisions.md`).

## 3. Environment

Start from `.env.example` and change these for production. Every service validates its environment at boot and refuses to start with a clear message when something is missing or unsafe.

| Variable                                     | Production value                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                   | `production`                                                                                      |
| `AUTH_SECRET`, `REALTIME_JWT_SECRET`         | Two different values from `openssl rand -base64 32` (the `.env.example` placeholders are refused) |
| `DEV_AUTH_BYPASS`                            | `false` (refused in production)                                                                   |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`       | A GitHub OAuth app with callback `https://app.example.com/api/auth/callback/github`               |
| `AUTH_URL`                                   | `https://app.example.com` (or `AUTH_TRUST_HOST=true` behind a proxy that sets the host)           |
| `REALTIME_URL`                               | `wss://rt.example.com` (`ws://` is refused: browsers block it from an https page)                 |
| `WEB_ORIGIN`                                 | `https://app.example.com` (the realtime server rejects WebSockets from any other origin)          |
| `META_API_KEY`, `MODEL_*`, `META_*`          | As in your local `.env`; run `pnpm ai:check` against them first                                   |
| `VISION_SERVICE_URL`, `VISION_SERVICE_TOKEN` | From step 2                                                                                       |

Leave `MODEL_MOCK=false`. Demo Mode projects still use the mocked adapters, so the seeded project works without spending model calls.

## 4. Build, migrate and start

On each Node host (or in its build step):

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm build
```

Once per release, before the new version takes traffic:

```bash
pnpm db:migrate
```

Optionally load the fictional Demo Mode project (safe to re-run):

```bash
pnpm db:seed
```

Then start each process (one per service on platforms that run one command per service):

```bash
pnpm --filter @stage-ready/web start
```

```bash
pnpm --filter @stage-ready/realtime start
```

```bash
pnpm --filter @stage-ready/worker start
```

`pnpm start` at the root runs all three on one machine. Next.js listens on `PORT` (default 3000), realtime on `REALTIME_PORT` (4000), and the worker serves its health check on `WORKER_HEALTH_PORT` (4100). Every service answers `GET /api/health`; point the platform's health check at it.

Put TLS in front of web and realtime (the platform's proxy usually does this). The realtime proxy must allow WebSocket upgrades and idle connections of at least 10 minutes.

## 5. Check the deploy

1. `GET /api/health` on web, realtime and worker returns `"status":"ok"`, and realtime and worker report `"models":"meta"`.
2. Sign in with GitHub, open the Demo Mode project, and run a 1-minute rehearsal: judges speak, claims appear.
3. Record one Director take: it uploads, gets a thumbnail and a score. Render the Demo Mode cut; the MP4, SRT, thumbnail and chapters download.
4. Open DemoGuard, build a step map and run pre-flight.

## Recording the submission video

The Director renders the team's own submission video: record one take per section in **Director**, let the worker transcribe and score them, check the auto-EDL fits the limit, then **Render**. That part needs you at the camera.
