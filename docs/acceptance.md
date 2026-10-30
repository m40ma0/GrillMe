# Acceptance checklist

Every acceptance criterion from `docs/BUILD_PROMPT.md`, and the automated test that proves it. Run them all with:

```bash
pnpm test                                      # unit and integration (Vitest)
pnpm test:e2e                                  # Playwright in Demo Mode, fake camera and mic
cd services/vision && .venv/bin/python -m pytest
```

E2E specs live in `apps/web/e2e/`. CI runs all three on every push.

## M0

| Criterion                                                                           | Proof                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` boots web, realtime and worker with zero errors                          | Checked by hand at each milestone: no error, warning or deprecation lines in the boot log, and `/api/health` answers on :3000, :4000 and :4100. Playwright's `webServer` also boots it in CI. |
| The app shell renders in dark and light mode; axe finds no serious violations       | `accessibility.spec.ts`: every screen, in dark and in light, zero serious or critical axe violations.                                                                                         |
| `db:seed` loads the Demo Mode project, and every screen renders it without API keys | `accessibility.spec.ts` visits every screen of the seeded project with no `META_API_KEY`; CI runs `pnpm db:seed` on a fresh database first.                                                   |

## F1 Judge Panel

| Criterion                                                                            | Proof                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| At difficulty 3, judges interrupt at least twice in 3 minutes and never mid-sentence | `rehearsal.spec.ts` (at least two interruptions in a real 3-minute Demo Mode session); `live-session.test.ts` "never cuts in on a partial" (judges decide only after a sentence's final transcript, and a claim update during speech waits for the sentence to end). |
| "Let me finish" makes the judge yield within 1 s and queue the question              | `live-session.test.ts` "let me finish makes the speaking judge yield at once and queue the question" (yields on the first partial transcript, measured under 1 s, `judge.yield` carries the queued question).                                                        |
| Personas show the "Fictional persona" label and use no real names                    | `rehearsal.spec.ts` (label visible); `shared.test.ts` "fictional personas" (no name field, `isFictional` must be true, real names from the event page are caught). The database also enforces `is_fictional = true`.                                                 |

## F2 Claim Auditor

| Criterion                                                                                                                            | Proof                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "It's instant" before a 9-second response gives a Contradicted chip with the measured time within 2 s of the sentence ending         | `live-session.test.ts` "Claim Auditor timing" (with the measurement known, Contradicted with "9.2 s" within 2 s; said before the step, Contradicted as soon as the running step outlasts the promise, then refined with the final time); `rehearsal.spec.ts` (Contradicted with a 9.x s stopwatch reading in a live session). |
| A feature mentioned but not shown is flagged Not shown at the end of the demo section                                                | `rehearsal.spec.ts` ("Teams can compare…" is Not shown after the demo).                                                                                                                                                                                                                                                       |
| Claiming encryption in a repo without a crypto library returns Unverified or Contradicted with a `file:line` or dependency reference | `pure.test.ts` "cites dependencies when encryption has no crypto library"; `rehearsal.spec.ts` (Unverified in the ledger).                                                                                                                                                                                                    |
| Identical outputs for two different inputs raise the canned-response flag                                                            | `pure.test.ts` and `live-session.test.ts` "flags identical outputs for two different inputs".                                                                                                                                                                                                                                 |

## F3 Calibration

| Criterion                                                                                           | Proof                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pasting an event page gives an EventSpec where every field quotes its source, and unknowns are null | `setup-wizard.spec.ts`; `heuristics.test.ts` (a quote for every field, unknowns null); `shared.test.ts` "nulls fields whose quotes are not in the source". |
| Criteria weights cannot be saved unless they sum to 100%                                            | `setup-wizard.spec.ts`; `shared.test.ts` "cannot be saved unless they sum to 100%".                                                                        |
| The compliance checklist marks a video over the limit as failed                                     | `shared.test.ts` "marks a video over the limit as failed".                                                                                                 |

## F4 Evidence Q&A Kit

| Criterion                                                                                           | Proof                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| At least 20 ranked questions; every answer script has 55 words or fewer                             | `qa.test.ts` (20+ questions, every script ≤ 55 words, ranked by likelihood × damage; the schema rejects longer scripts); `qa-kit.spec.ts`.                           |
| Every slide number matches its `dataSnapshot`; a mismatch triggers the deterministic fallback slide | `slides.test.ts` (every snapshot number is drawn; a reading that misses one, or fails, renders the fallback); `qa-kit.spec.ts` ("Numbers verified" after a rebuild). |
| Cmd+K shows the right backup slide in under 2 s                                                     | `qa-kit.spec.ts` (search, select, image decoded, under 2 s).                                                                                                         |

## F5 Best-Take Director

| Criterion                                                                                                      | Proof                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| From 12 fixture takes, the auto-EDL fits within 180 s and picks the highest-scoring valid take per section     | `director.test.ts`; `director.spec.ts` (against the seeded 12 takes).                                                                                                                                                                                                          |
| The render outputs MP4, SRT, a thumbnail and chapters; captions match the transcript; loudness is −14 LUFS ± 1 | `test_render.py` (valid 1080p30 H.264 MP4 within 100 ms of the expected length, −14 ± 1 LUFS, thumbnail); `director.test.ts` "maps take words onto the output timeline and matches the transcript"; `director.spec.ts` (render through the worker, all four exports download). |
| A Hook take without the strongest demo moment raises the First-20-seconds warning                              | `director.test.ts`; `director.spec.ts`.                                                                                                                                                                                                                                        |

## F6 DemoGuard

Fallback playback runs in browser mode: the Stage window (`/demoguard/stage`, the window the presenter shares) crossfades to the golden-run clip at the step's in-point with the Recorded-segment badge, and cuts back at the step boundary (see `docs/decisions/0007-review-fixes.md`). OBS scene switching is not built.

| Criterion                                                                                                           | Proof                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-flight blocks Arm while any critical check fails                                                                | `demoguard.test.ts` (shared, reducer) and realtime `demoguard.test.ts` "pre-flight blocks Arm until the critical checks pass" (enforced on the server); `demoguard.spec.ts` (Arm enabled only once all critical checks pass).                                                             |
| An injected error dialog switches to fallback within 1.5 s, at the correct step's in-point, with the badge visible  | `demoguard.spec.ts` (fake screen with a red error dialog; switch time measured from frame capture, under 1.5 s; the Stage window plays the clip from the in-point with the badge); realtime `demoguard.test.ts` (switch on that frame, seek to the step's in-point; Test the safety net). |
| When the live app recovers, the cut back happens at the next step boundary; Panic, Resume and Freeze work by hotkey | `demoguard.spec.ts` (cut back after exactly one clip length on fallback; Shift+P, Shift+R, Shift+F); shared `demoguard.test.ts` table.                                                                                                                                                    |
| With the companion offline, browser mode still switches correctly                                                   | `demoguard.spec.ts` runs with no companion.                                                                                                                                                                                                                                               |

## F7 Rehearsal Memory

| Criterion                                                                                  | Proof                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| After two sessions, Coach Notes list at least one resolved item and a three-item next plan | `rehearsal.spec.ts` (after the seeded session and a new one: "Resolved since last time" and exactly three plan items); `heuristics.test.ts` (resolved, open and new by key; always three items). |
