# 0006 — Decisions made while building M6 (harden and ship)

Date: 2026-10-30. No stack changes and no migration (`takes.thumbnail_url` already existed). `tsx` moved from dev to runtime dependencies of `apps/realtime` and `apps/worker`, since it is what runs them.

## Open bugs fixed

1. **Render status across Modal containers.** Render jobs run on a thread in one vision service instance, and their status lived only in that instance's memory, so a status poll routed to another container got a 404 and the render failed. The worker now passes a presigned PUT (`outputs.status`) with each render; the job writes its public status JSON there when it starts, at most once a second while it runs, and when it ends. When a poll gets a 404, the worker reads `status.json` from storage instead (`renderStatus` in `apps/worker/src/lib/vision.ts`). A missing status, or one for another job, fails with "Render again". Writing the status is best effort: an upload error never fails the render.
2. **Thumbnails per take.** After transcription, `take-process` asks the vision service for one frame (`POST /thumbnail`, at 2 s or a third of the take, whichever is earlier), stored as a 640×360 JPEG at `projects/<id>/takes/<take>/thumbnail.jpg` and served through `GET /api/takes/:id/thumbnail` (a redirect to a short-lived URL). FFmpeg decodes from the start rather than seeking, because browser WebM recordings have no seek index; only the first seconds are read. A failed thumbnail is logged and the take still scores. Fixture takes keep their placeholder.

## Production hardening

3. **Unsafe production config is refused at boot.** With `NODE_ENV=production`, web and realtime refuse the `.env.example` placeholder secrets (`replace-with-…`), a `ws://` `REALTIME_URL` (browsers block it from https), and a localhost `WEB_ORIGIN`; `DEV_AUTH_BYPASS` was already refused. Each message says what to set.
4. **Production start.** `pnpm build` then `pnpm start` (all three Node services) or `pnpm --filter <app> start` per service. Checked here with `NODE_ENV=production`: all three boot without warnings and answer `/api/health`.
5. **Deploy guide** in `docs/deploy.md`: managed Postgres with pgvector, Redis, R2 or S3 with a CORS rule for browser uploads, the vision service on Modal, the production environment table, and a post-deploy check. Storage must be reachable from the internet, because browsers and Modal use presigned URLs.

## Not done here

- **Deploying** needs your accounts (hosting, database, Redis, storage, Modal, a GitHub OAuth app). The guide lists every step.
- **The team's submission video** is recorded with the Director by the team.
- **DemoGuard fallback playback and OBS switching** stay out of scope until asked for (see 0005).
- **Not verified in this environment:** Modal itself and a real multi-container poll (the storage fallback was exercised against the local stack by asking for an unknown job id), and a production TLS proxy.
