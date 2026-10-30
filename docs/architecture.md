# Architecture

Copied from `docs/BUILD_PROMPT.md` ("Diagrams") and kept in sync with the code. Status notes below each diagram say what exists today.

## System architecture

The browser and the companion both talk to the realtime server; heavy work runs in queued jobs and on Modal.

```mermaid
flowchart LR
  subgraph Presenter["Presenter machine"]
    B["Browser: Next.js app<br/>mic, camera, screen capture"]
    C["Companion CLI<br/>OBS control, proxy, input hooks, repo reader"]
    O["OBS Studio<br/>Live and Fallback scenes"]
  end
  subgraph Cloud["Cloud"]
    W["Next.js server<br/>Route Handlers, Auth.js"]
    RT["Realtime server<br/>Fastify + WebSocket"]
    Q["BullMQ workers"]
    DB[("Postgres + pgvector")]
    R[("Redis")]
    S3[("S3 / R2 storage")]
    V["Vision and media service on Modal<br/>SAM 3.1, FFmpeg, faster-whisper"]
    M["Meta Model API<br/>Muse Spark, Muse Wonder, Muse Image"]
  end
  B <-->|REST| W
  B <-->|WebSocket: audio, frames, events| RT
  C <-->|WebSocket: signals, commands| RT
  C <-->|obs-websocket| O
  W --> DB
  W --> Q
  RT --> DB
  RT --> R
  Q --> R
  Q --> DB
  Q --> S3
  B -->|presigned upload| S3
  RT --> V
  Q --> V
  V --> S3
  RT --> M
  Q --> M
```

Status (M5): web, worker (`event-ingest`, `winners`, `repo-digest`, `session-review`, `questions`, `slides`, `take-process`, `render`), realtime (rehearsals with the full Claim Auditor, and DemoGuard runs), Postgres, Redis and S3 are live. All model access goes through `packages/ai` (Meta chat-completions adapter, or the mocked adapter when no key is set or the project is in Demo Mode), traced with OpenTelemetry. The vision service serves streaming STT and take transcription (faster-whisper), SAM 3.1 tracking (when a checkpoint is configured), frame hashes and the Director render (FFmpeg). The companion (M5) joins DemoGuard runs for network signals, local pre-flight checks and hotkeys.

## Live rehearsal sequence

Every final sentence triggers claim extraction, verification and an interruption decision.

```mermaid
sequenceDiagram
  autonumber
  participant P as Presenter (browser)
  participant RT as Realtime server
  participant STT as Speech to text
  participant V as Vision service (SAM 3.1)
  participant SP as Muse Spark
  participant DB as Postgres
  P->>RT: session.start (projectId, mode, personas)
  loop every 250 ms
    P->>RT: audio.chunk
    RT->>STT: stream audio
    STT-->>RT: transcript partial and final, word timestamps
  end
  loop 2 fps in rehearsal, 4 fps in DemoGuard
    P->>RT: frame (JPEG, timestamp)
    RT->>V: track spinner, error dialog, result region
    V-->>RT: masks and UI states
  end
  RT->>SP: extract claims from the final sentence
  SP-->>RT: Claim[] (zod-validated)
  RT->>RT: verify against frames, timings, repo digest
  RT-->>P: ledger.update (claim, status, evidence)
  RT->>SP: should a judge interrupt?
  SP-->>RT: JudgeTurn or none
  RT-->>P: judge.speak (text and TTS audio)
  P->>RT: session.end
  RT->>DB: persist session, claims, latencies, transcript
  RT-->>P: session.summary ready
```

Status: built in M2 (`apps/realtime/src/session/live-session.ts`). Deterministic rules (`auditor/rules.ts`) run before the verify call; the interruption decision is gated by `judges/policy.ts`. In Demo Mode, STT is the scripted provider.

## DemoGuard state machine

One critical signal, or two corroborating ones, moves Live to Fallback; recovery waits for a step boundary.

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Preflight: start presentation
  Preflight --> Preflight: fix and re-run
  Preflight --> Armed: all critical checks pass
  Armed --> Live: first step detected
  Live --> Suspect: one non-critical signal
  Suspect --> Live: signal clears within 1 s
  Suspect --> Fallback: second corroborating signal
  Live --> Fallback: critical signal or Panic hotkey
  Fallback --> Recovering: live app reaches expected state
  Recovering --> Live: next step boundary
  Fallback --> Live: Resume hotkey
  Live --> Frozen: Freeze hotkey
  Frozen --> Live: Resume hotkey
  Live --> Done: last step complete
  Fallback --> Done: last fallback step ends
  Done --> [*]
```

Status: M5.

## Core data model

The project is the root; sessions, takes and step maps hang off it. All 28 tables exist in `packages/db/src/schema.ts` (uuid v7 ids, `createdAt`, `updatedAt`, `projectId` on every child).

```mermaid
erDiagram
  USER ||--o{ PROJECT : owns
  PROJECT ||--|| EVENT_SPEC : targets
  EVENT_SPEC ||--o{ CRITERION : has
  PROJECT ||--o{ PAST_WINNER : references
  PROJECT ||--o| REPO : links
  REPO ||--o{ REPO_FINDING : produces
  PROJECT ||--o{ PERSONA : uses
  PROJECT ||--o{ SESSION : has
  SESSION ||--o{ TRANSCRIPT_SEGMENT : contains
  SESSION ||--o{ CLAIM : contains
  CLAIM ||--o{ EVIDENCE : supported_by
  SESSION ||--o{ LATENCY_SAMPLE : measures
  SESSION ||--o{ JUDGE_TURN : contains
  PROJECT ||--o{ QUESTION : anticipates
  QUESTION ||--o| ANSWER_CARD : has
  ANSWER_CARD ||--o{ SLIDE : shows
  PROJECT ||--o{ SECTION_PLAN : defines
  SECTION_PLAN ||--o{ TAKE : records
  TAKE ||--|| TAKE_SCORE : scored_by
  PROJECT ||--o{ EDL : assembles
  EDL ||--o{ RENDER_JOB : renders
  PROJECT ||--o{ STEP_MAP : protects
  STEP_MAP ||--o{ STEP : has
  STEP_MAP ||--o{ INCIDENT : logs
  PROJECT ||--o{ FIX_TASK : tracks
  PROJECT ||--o{ COACH_NOTE : remembers
```

## Best-Take render pipeline

The length fitter loops until the assembled cut fits the event's limit.

```mermaid
flowchart TD
  A["Takes per section"] --> B["Transcribe with word timestamps"]
  B --> C["Score takes: delivery, coverage, claims, demo success, time fit"]
  C --> D{"Total within video limit?"}
  D -- no --> E["Length fitter swaps in tighter takes"]
  E --> D
  D -- yes --> F["Build EDL"]
  F --> G["Title cards from Muse Image"]
  F --> H["Captions: ASS and SRT"]
  G --> I["FFmpeg render: crossfades, -14 LUFS, burned captions"]
  H --> I
  I --> J["Exports: MP4, SRT, thumbnail, chapters"]
```

Status (M6): live. Takes are transcribed, given a thumbnail (`POST /thumbnail`) and scored by the worker (`take-process`), the EDL is built in `packages/shared` (`buildAutoEdl`), and the vision service renders it (`POST /render`, status mirrored to storage so any instance can answer). Title text is drawn by Pillow over a Muse Image background when `MODEL_IMAGE` is set; see `docs/decisions/0004-m4-decisions.md` and `0006-m6-decisions.md`.

Evidence slides: the `questions` job writes the bank and cards, then renders each slide (Vega-Lite → SVG → PNG with resvg), verifies its numbers with Muse Spark against the `dataSnapshot`, falls back to a deterministic template on any mismatch, and rebuilds the PDF appendix.

## M1 ingestion flow

```mermaid
sequenceDiagram
  participant UI as Setup wizard / Calibration
  participant W as Route Handlers
  participant Q as BullMQ worker
  participant AI as packages/ai (Meta or mock)
  UI->>W: POST /api/projects/:id/event/ingest { urls[], text? }
  W->>Q: event-ingest job
  W-->>UI: 202 { jobId }
  loop every 1.5 s
    UI->>W: GET /api/jobs/:id
  end
  Q->>Q: fetch pages as text (untrusted data), hash for cache
  Q->>AI: eventSpec.v1 (quoted page text)
  AI-->>Q: EventSpecExtraction (zod, one retry on parse failure)
  Q->>Q: enforceEventSpecQuotes: unquoted fields → null, unquoted weights → equal + inferred
  Q->>Q: upsert event_specs + criteria
  UI->>W: PATCH /api/projects/:id/event (weights must total 100%)
```

## Rehearsal Memory (M3)

After a session is persisted, the realtime server queues `session-review`. The worker audits claims still Unverified (Muse Wonder, model mode only), extracts weak spots with stable keys, diffs them against the previous Coach Note, retrieves memory (pgvector by relevance, or recency), and writes the next Coach Note with a three-item plan.

```mermaid
sequenceDiagram
  participant RT as Realtime server
  participant Q as BullMQ
  participant W as Worker: session-review
  participant WD as Muse Wonder
  participant DB as Postgres + pgvector
  RT->>DB: persist session (claims, latency hashes, flags)
  RT->>Q: session-review { projectId, sessionId }
  Q->>W: run
  W->>WD: sessionAudit.v1 (unverified claims, repo findings, README, submission)
  WD-->>W: verdicts with refs (no evidence = no change)
  W->>DB: weak spots vs previous Coach Note (resolved, open, new)
  W->>DB: nearest earlier notes by embedding
  W->>WD: coachNotes.v1
  WD-->>W: three-item next plan
  W->>DB: insert coach_notes (+ embedding)
```
