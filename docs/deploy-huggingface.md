# Deploying on a Hugging Face Space (free)

One free Docker Space runs the web app, the realtime server, the worker and Redis in a single container behind one port. A small router (`deploy/huggingface/router.mjs`) sends WebSockets on `/ws` to the realtime server and everything else to the web app. The database (Neon), storage (S3-compatible, such as Backblaze B2 or R2) and the vision service (Modal) stay outside; set them up first with steps 1 to 3 of `docs/deploy.md`.

What to know:

- The free CPU Space has about 2 vCPU and 16 GB of memory. Free Spaces sleep after a long time without visits and wake on the next one (it takes a minute or two).
- Redis lives inside the container, so jobs still queued when the Space restarts are lost. Projects, sessions and files are in Neon and storage, and are kept.
- Migrations run at every start, so a rebuild with new code updates the database by itself.

## 1. Create the Space

1. Sign up at huggingface.co.
2. Go to **New → Space**:
   - **Space name:** `stage-ready`
   - **License:** any (or leave empty)
   - **SDK:** **Docker**, template **Blank**
   - **Hardware:** **CPU basic (free)**
   - **Visibility:** **Public**. The app has its own GitHub sign-in, and only the Space's two files are visible, not your code or secrets. A private Space only opens for people signed in to Hugging Face with access to it.
3. Click **Create Space**.

Your app's address is `https://<hf-username>-stage-ready.hf.space` (all lowercase). Call it `SPACE_URL` below.

## 2. Add the two files

The Space needs only `Dockerfile` and `README.md` from `deploy/huggingface/` in this repo. The Dockerfile clones the repo from GitHub when the Space builds.

1. In the Space, open **Files**.
2. Click `README.md` → **Edit**, replace everything with the contents of `deploy/huggingface/README.md`, and **Commit**. (The `app_port: 7860` line in it matters.)
3. **Add file → Create a new file**, name it `Dockerfile`, paste the contents of `deploy/huggingface/Dockerfile`, and **Commit**.

The Space starts building. It fails until the secrets below are set; that is expected.

## 3. GitHub sign-in

On GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.

- **Homepage URL:** `SPACE_URL`
- **Authorization callback URL:** `SPACE_URL/api/auth/callback/github`

Register it, then **Generate a new client secret**. Keep the Client ID and the secret.

## 4. Secrets

In the Space: **Settings → Variables and secrets → New secret**, one per line below. Use **secrets**, not variables: variables of a public Space can be seen by others.

| Name                   | Value                                                           |
| ---------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`         | Neon connection string (no `-pooler` in the host)               |
| `S3_ENDPOINT`          | e.g. `https://s3.us-west-004.backblazeb2.com`                   |
| `S3_BUCKET`            | Your bucket name                                                |
| `S3_ACCESS_KEY`        | B2 keyID / R2 access key ID                                     |
| `S3_SECRET_KEY`        | B2 applicationKey / R2 secret                                   |
| `S3_REGION`            | B2: the region in the endpoint (e.g. `us-west-004`); R2: `auto` |
| `AUTH_SECRET`          | `openssl rand -base64 32`                                       |
| `REALTIME_JWT_SECRET`  | Another `openssl rand -base64 32`                               |
| `AUTH_GITHUB_ID`       | From step 3                                                     |
| `AUTH_GITHUB_SECRET`   | From step 3                                                     |
| `VISION_SERVICE_URL`   | Your Modal URL                                                  |
| `VISION_SERVICE_TOKEN` | The token in the Modal secret                                   |
| `MODEL_API_KEY`        | Your Meta Model API key                                         |
| `META_API_BASE_URL`    | `https://api.meta.ai/v1`                                        |
| `META_API_STYLE`       | `responses`                                                     |
| `MODEL_SPARK`          | `muse-spark-1.3`                                                |
| `MODEL_WONDER`         | `muse-wonder-1.0`                                               |
| `MODEL_IMAGE`          | `muse-image-1.0`                                                |
| `MODEL_SAM`            | `sam-3.1`                                                       |
| `META_RESPONSE_FORMAT` | `json_schema`                                                   |

Not needed: `NODE_ENV` and `REDIS_URL` are set in the image, and `AUTH_URL`, `REALTIME_URL` and `WEB_ORIGIN` are derived from the Space's address (`SPACE_HOST`). Set them only if you put the Space behind your own domain.

## 5. Storage CORS

Browsers upload recordings straight to storage, so the bucket must allow `SPACE_URL`.

- **Backblaze B2:** bucket → **Bucket Settings → CORS Rules** → share with one origin, enter `SPACE_URL`, and apply it to the **S3 Compatible API**. If uploads still fail with a CORS error, the rule needs the S3 PUT operation; set it with the B2 command-line tool instead.
- **R2:** bucket → **Settings → CORS policy**:

  ```json
  [{ "AllowedOrigins": ["SPACE_URL"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
  ```

## 6. Build and check

1. In the Space, **Settings → Factory rebuild** (or it rebuilds by itself after the secrets change). Watch **Logs → Build**, then **Logs → Container**. The first build takes several minutes.
2. When the Space shows **Running**, open `SPACE_URL/api/health`: `{"service":"web","status":"ok"}`.
3. The container log should show `router on :7860`, `Migrations applied.`, realtime `Server listening`, and `worker listening on queue stage-ready-jobs` with `"models":"meta"` (not `mock`).
4. Open `SPACE_URL` directly (not the huggingface.co Space page, whose frame blocks the camera and microphone), sign in with GitHub, open Signal Garden and run a short rehearsal.

If the container stops at start, its log says why: a configuration error names the missing or wrong secret, and "A Stage Ready process exited" names the code.

## Updating

Push to `main` on GitHub, then **Settings → Factory rebuild** in the Space. Migrations run on start.
