# Build history

Stage Ready was built milestone by milestone from `docs/BUILD_PROMPT.md` (M0 to M6), then improved from an external review (`docs/decisions/0007-review-fixes.md`). Each milestone's decisions are in `docs/decisions/`.

## Upgrading from the M0 checkpoint

the schema was rebuilt to the spec, so reset the database once with `docker compose down -v && docker compose up -d && pnpm db:migrate && pnpm db:seed`.

## What each milestone added

### Rehearsal Studio (M2)

Open a project's **Rehearsal Studio**, pick a mode and difficulty, tick consent and press **Start rehearsal** (Cmd+Enter). Demo Mode projects work with no services beyond `pnpm dev`: speech is scripted. Real projects need speech to text: run the vision service (above) and set `VISION_SERVICE_URL`. Use headphones so the judges' voices are not picked up by your mic. Cmd+. asks the speaking judge to yield; Cmd+Shift+L toggles the dev latency HUD.

### Session review and progress (M3)

After **Stop**, the session is audited further: features mentioned but not shown are flagged, claims are checked against the repo and the written submission (Calibration → Written submission), and Coach Notes compare the session with earlier ones. Open **Sessions** for the review (summary, claims, rubric heatmap, latency, judge turns, transcript with a captioned player) and **Progress** for trends and the next-session plan. Local recordings are opened from disk in the review; they are never uploaded unless the project opts in.

### Evidence Q&A Kit and Director (M4)

**Q&A Kit** ranks the questions judges are most likely to ask, with a 20-second answer card (55 words or fewer) and an evidence slide per question whose numbers come straight from your data and are checked after rendering. Rebuild it any time; it also rebuilds after each rehearsal. **Start drill** asks random questions (weak ones more often) against a 20-second ring. During real Q&A, press Cmd+K and type a few words of the question to put its backup slide on screen. Export the slides as a PDF appendix.

**Director** gives every recorded take a thumbnail and scores it (delivery, criteria coverage, contradicted claims, demo success, time fit), assembles the best take per section within the video limit, warns when the Hook does not show your strongest demo moment, and renders the MP4 with crossfades, −14 LUFS, burned captions and chapter cards, plus SRT, thumbnail and chapters. Recording takes needs cloud upload on, the job worker, storage and the vision service (FFmpeg); the Demo Mode project ships 12 fixture takes so you can assemble and render without recording.

### DemoGuard (M5)

Build the **step map** from a golden-run rehearsal (one step per timed step, editable), run **pre-flight** a minute before presenting (Arm unlocks when every critical check passes), and keep **Live control** open while you present: it shows the state (Armed, Live, Suspect, Fallback, Recovering, Frozen), the step, the signal feed and Panic / Resume / Freeze (Shift+P / Shift+R / Shift+F). Open the **cue window** on a second monitor for the current step, next step and narration. The **post-mortem** lists each run's incidents and time on fallback. For network signals and local checks, run the companion (see `docs/companion.md`). Fallback video playback and OBS scene switching are not built yet: DemoGuard decides and records the switch and shows what it would cue.

### What M1 includes (setup and calibration)

- Setup wizard (`/projects/new`): basics, event ingestion with a live EventSpec to confirm or edit, past winners, repo digest, pitch and section plan.
- Event ingestion: every EventSpec field quotes its source verbatim; unknowns are null; unpublished weights become equal and are marked inferred.
- Criteria weights cannot be saved unless they total 100%.
- Past-winner profiles with cited fields, winning patterns (each citing two or more winners) checked against your project, and a track recommendation.
- Repo digest (read-only, cached by commit SHA in S3): dependencies, tests, TODOs, committed secrets, possible mock responses, and code capabilities with `file:line`.
- Compliance checklist: video within limit, required technology in the repo, repo public, deadline countdown in your time zone.
- Three fictional personas built from the criteria; names of real people on the event page are rejected.
