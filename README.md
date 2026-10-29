# Stage Ready

Rehearse against honest judges. Present with a safety net.

Stage Ready helps people rehearse high-stakes demos: fictional judges built from the event's real criteria, a Claim Auditor that checks claims against evidence, prepared answers, a best-take video Director and DemoGuard for the live demo. It is built milestone by milestone from `docs/BUILD_PROMPT.md`; **M0 (scaffold), M1 (setup and calibration), M2 (Studio core), M3 (auditor complete, review and memory) and M4 (Q&A Kit and Director) are done.**

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

`pnpm dev` runs the web app (http://localhost:3000), the realtime server (:4000) and the job worker (health on :4100). Postgres, Redis and MinIO run on 5432, 6379 and 9000 (console :9001). Start the vision service with `cd services/vision && python -m uvicorn app.main:app --reload --port 8000`.

Upgrading from the M0 checkpoint: the schema was rebuilt to the spec, so reset the database once with `docker compose down -v && docker compose up -d && pnpm db:migrate && pnpm db:seed`.

### Models

With `META_API_KEY` empty, every service runs on mocked model adapters and Demo Mode works with no keys. To use the Meta Model API, fill `META_API_BASE_URL`, `META_API_KEY`, `MODEL_SPARK`, `MODEL_WONDER` (and the rest) from the official docs, and set `META_RESPONSE_FORMAT` to the JSON mode the API supports. The worker checks the configured IDs against the API's model listing at startup.

### Rehearsal Studio (M2)

Open a project's **Rehearsal Studio**, pick a mode and difficulty, tick consent and press **Start rehearsal** (Cmd+Enter). Demo Mode projects work with no services beyond `pnpm dev`: speech is scripted. Real projects need speech to text: run the vision service (above) and set `VISION_SERVICE_URL`. Use headphones so the judges' voices are not picked up by your mic. Cmd+. asks the speaking judge to yield; Cmd+Shift+L toggles the dev latency HUD.

### Session review and progress (M3)

After **Stop**, the session is audited further: features mentioned but not shown are flagged, claims are checked against the repo and the written submission (Calibration → Written submission), and Coach Notes compare the session with earlier ones. Open **Sessions** for the review (summary, claims, rubric heatmap, latency, judge turns, transcript with a captioned player) and **Progress** for trends and the next-session plan. Local recordings are opened from disk in the review; they are never uploaded unless the project opts in.

### Evidence Q&A Kit and Director (M4)

**Q&A Kit** ranks the questions judges are most likely to ask, with a 20-second answer card (55 words or fewer) and an evidence slide per question whose numbers come straight from your data and are checked after rendering. Rebuild it any time; it also rebuilds after each rehearsal. **Start drill** asks random questions (weak ones more often) against a 20-second ring. During real Q&A, press Cmd+K and type a few words of the question to put its backup slide on screen. Export the slides as a PDF appendix.

**Director** scores every take (delivery, criteria coverage, contradicted claims, demo success, time fit), assembles the best take per section within the video limit, warns when the Hook does not show your strongest demo moment, and renders the MP4 with crossfades, −14 LUFS, burned captions and chapter cards, plus SRT, thumbnail and chapters. Recording takes needs cloud upload on, the job worker, storage and the vision service (FFmpeg); the Demo Mode project ships 12 fixture takes so you can assemble and render without recording.

## Commands

- `pnpm dev`: web, realtime server and job worker
- `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`: Drizzle migrations and the fictional Signal Garden Demo Mode project
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`: workspace checks (CI runs all of them)
- `pnpm test:e2e`: Playwright in Demo Mode with fake camera and mic (needs FFmpeg; starts `pnpm dev` if it is not running)
- `cd services/vision && .venv/bin/python -m pytest`: vision service tests
- `pnpm companion`: the local companion CLI (OBS optional for now)

## What M1 includes

- Setup wizard (`/projects/new`): basics, event ingestion with a live EventSpec to confirm or edit, past winners, repo digest, pitch and section plan.
- Event ingestion: every EventSpec field quotes its source verbatim; unknowns are null; unpublished weights become equal and are marked inferred.
- Criteria weights cannot be saved unless they total 100%.
- Past-winner profiles with cited fields, winning patterns (each citing two or more winners) checked against your project, and a track recommendation.
- Repo digest (read-only, cached by commit SHA in S3): dependencies, tests, TODOs, committed secrets, possible mock responses, and code capabilities with `file:line`.
- Compliance checklist: video within limit, required technology in the repo, repo public, deadline countdown in your time zone.
- Three fictional personas built from the criteria; names of real people on the event page are rejected.

## Privacy and safety defaults

Fixture data is fictional. Event, winner and repo content is treated as untrusted data and never as instructions. Recordings stay local by default, judge personas are always fictional, the recorded-segment badge is on by default, and Stage Ready never writes to your repo.
