# Stage Ready

Rehearse against honest judges. Present with a safety net.

Stage Ready helps people rehearse high-stakes demos: fictional judges built from the event's real criteria, a Claim Auditor that checks claims against evidence, prepared answers, a best-take video Director and DemoGuard for the live demo. It was built milestone by milestone from `docs/BUILD_PROMPT.md`; **M0 to M6 are done**, with one exception by request: DemoGuard decides and records fallback switches but does not play the fallback video or switch OBS scenes yet.

Try it without any keys: follow Local setup, open the seeded **Signal Garden** project (Demo Mode, fictional data) and press **Start rehearsal**.

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

`pnpm dev` runs the web app (http://localhost:3000), the realtime server (:4000) and the job worker (health on :4100). Postgres, Redis and MinIO run on 5432, 6379 and 9000 (console :9001).

MinIO's official image is no longer on Docker Hub, so `docker-compose.yml` pins the last Bitnami MinIO build. If it will not pull, stop that container and use the moto S3 server instead (in memory, so uploads are lost when it stops), which is what CI uses:

```sh
pip install "moto[server]==5.1.4"
moto_server -p 9000
```

The vision service (speech to text, take transcription, the Director render, SAM tracking) needs Python 3.12 and FFmpeg:

```sh
cd services/vision
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Upgrading from the M0 checkpoint: the schema was rebuilt to the spec, so reset the database once with `docker compose down -v && docker compose up -d && pnpm db:migrate && pnpm db:seed`.

### Models

With no API key, every service runs on mocked model adapters and Demo Mode works. With a Meta Model API key in `.env` (`MODEL_API_KEY` or `META_API_KEY`), Stage Ready uses `muse-spark-1.3` for live calls (reasoning effort `low` by default, for speed), `muse-wonder-1.0` for background work (`high`), `muse-image-1.0` for Director title-card artwork and `sam-3.1` for DemoGuard UI tracking, all through `https://api.meta.ai/v1` (`.env.example` has the values). Run `pnpm ai:check` after filling `.env`: it makes one call per model and prints which JSON mode to set. Speech to text stays on faster-whisper (the API's transcription model has no word timestamps), and judge voices use the browser's speech synthesis.

### Rehearsal Studio (M2)

Open a project's **Rehearsal Studio**, pick a mode and difficulty, tick consent and press **Start rehearsal** (Cmd+Enter). Demo Mode projects work with no services beyond `pnpm dev`: speech is scripted. Real projects need speech to text: run the vision service (above) and set `VISION_SERVICE_URL`. Use headphones so the judges' voices are not picked up by your mic. Cmd+. asks the speaking judge to yield; Cmd+Shift+L toggles the dev latency HUD.

### Session review and progress (M3)

After **Stop**, the session is audited further: features mentioned but not shown are flagged, claims are checked against the repo and the written submission (Calibration → Written submission), and Coach Notes compare the session with earlier ones. Open **Sessions** for the review (summary, claims, rubric heatmap, latency, judge turns, transcript with a captioned player) and **Progress** for trends and the next-session plan. Local recordings are opened from disk in the review; they are never uploaded unless the project opts in.

### Evidence Q&A Kit and Director (M4)

**Q&A Kit** ranks the questions judges are most likely to ask, with a 20-second answer card (55 words or fewer) and an evidence slide per question whose numbers come straight from your data and are checked after rendering. Rebuild it any time; it also rebuilds after each rehearsal. **Start drill** asks random questions (weak ones more often) against a 20-second ring. During real Q&A, press Cmd+K and type a few words of the question to put its backup slide on screen. Export the slides as a PDF appendix.

**Director** gives every recorded take a thumbnail and scores it (delivery, criteria coverage, contradicted claims, demo success, time fit), assembles the best take per section within the video limit, warns when the Hook does not show your strongest demo moment, and renders the MP4 with crossfades, −14 LUFS, burned captions and chapter cards, plus SRT, thumbnail and chapters. Recording takes needs cloud upload on, the job worker, storage and the vision service (FFmpeg); the Demo Mode project ships 12 fixture takes so you can assemble and render without recording.

### DemoGuard (M5)

Build the **step map** from a golden-run rehearsal (one step per timed step, editable), run **pre-flight** a minute before presenting (Arm unlocks when every critical check passes), and keep **Live control** open while you present: it shows the state (Armed, Live, Suspect, Fallback, Recovering, Frozen), the step, the signal feed and Panic / Resume / Freeze (Shift+P / Shift+R / Shift+F). Open the **cue window** on a second monitor for the current step, next step and narration. The **post-mortem** lists each run's incidents and time on fallback. For network signals and local checks, run the companion (see `docs/companion.md`). Fallback video playback and OBS scene switching are not built yet: DemoGuard decides and records the switch and shows what it would cue.

## Deploying

See `docs/deploy.md` (it includes a free option that runs everything on Modal): managed Postgres (pgvector), Redis and S3/R2, the vision service on Modal, the production environment, then `pnpm build`, `pnpm db:migrate` and `pnpm start`. Services refuse to boot in production with placeholder secrets, `ws://` realtime URLs or the dev auth bypass.

## Commands

- `pnpm dev`: web, realtime server and job worker
- `pnpm build`, `pnpm start`: production build, then all three Node services
- `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`: Drizzle migrations and the fictional Signal Garden Demo Mode project
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`: workspace checks (CI runs all of them, plus the build)
- `pnpm test:e2e`: Playwright in Demo Mode with fake camera and mic (needs FFmpeg; starts `pnpm dev` if it is not running)
- `cd services/vision && .venv/bin/python -m pytest`: vision service tests
- `pnpm ai:check`: one live call per configured Meta model with your key (run it after filling `.env`); prints what passed and which JSON mode to use
- `pnpm companion --url '<from the DemoGuard page>'`: the DemoGuard companion (see `docs/companion.md`)

## Documentation

- `docs/BUILD_PROMPT.md`: the product spec
- `docs/architecture.md`: services, data flow and contracts
- `docs/acceptance.md`: every acceptance criterion and the test that proves it
- `docs/deploy.md`: production deployment
- `docs/companion.md`: the DemoGuard companion
- `docs/decisions/`: decisions made at each milestone, including what is not built and what could not be verified here

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
