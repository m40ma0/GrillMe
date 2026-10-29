# Stage Ready

Rehearse against honest judges. Present with a safety net.

Stage Ready helps speakers rehearse high-stakes demos, check spoken claims against evidence, prepare answers and protect a live presentation with a disclosed fallback. The product is being built milestone by milestone; the current milestone is the M0 scaffold.

## Local setup

Requirements: Node.js 22, pnpm 11, Docker Compose, and Python 3.12 for the vision service.

```sh
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The web app runs at `http://localhost:3000`, the realtime service at `http://localhost:4000`, and Postgres, Redis and MinIO are available on ports 5432, 6379 and 9000. Start the Python service separately with `cd services/vision && python -m uvicorn app:app --reload --port 8000`. No model credentials are needed for the M0 Demo Mode fixture.

The companion CLI can be started with `pnpm companion`; OBS is optional during scaffold development. MinIO console: `http://localhost:9001` (credentials in `.env.example`).

## Commands

- `pnpm dev` — web, realtime server and job worker
- `pnpm db:generate` — generate a Drizzle migration from the schema
- `pnpm db:migrate` — apply migrations
- `pnpm db:seed` — load the fictional Signal Garden Demo Mode project
- `pnpm lint`, `pnpm typecheck`, `pnpm build` — workspace checks

Model IDs and endpoints are intentionally unset. Verify them against the provider's current official documentation before implementing M1's model adapter. Do not put provider keys in browser code.

## Privacy and safety defaults

The fixture data is fictional. Recordings are local by default, project uploads require opt-in, judge personas are fictional, and the recorded-segment badge is on by default. Demo Mode runs without API keys.
