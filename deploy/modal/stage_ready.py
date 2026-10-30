"""Stage Ready (web, realtime, worker and Redis) as one Modal web app, on CPU.

Deploy from the repo root, with the code you have checked out:
    modal deploy deploy/modal/stage_ready.py

Settings come from the Modal secret "stage-ready-app" (see docs/deploy.md). The app is served at
https://<workspace>--stage-ready.modal.run; set PUBLIC_HOST in the secret to that host name.

One container at most: Redis and live rehearsal sessions are in its memory. It scales to zero after
20 idle minutes and starts again on the next visit (about a minute), so it only uses credits while in use.
"""

from pathlib import Path

import modal

# Only meaningful where you run `modal deploy`; inside the container the code is already in /app.
REPO = Path(__file__).resolve().parents[2] if modal.is_local() else Path("/app")

image = (
    modal.Image.from_registry("node:22-bookworm-slim", add_python="3.12")
    .apt_install("redis-server")
    .run_commands("npm install -g pnpm@11.14.0")
    .env({"CI": "true", "NEXT_TELEMETRY_DISABLED": "1"})
    .add_local_dir(
        REPO,
        "/app",
        copy=True,
        # Never ship local secrets or build output; dependencies are installed fresh below.
        ignore=["**/node_modules", "**/.next", "**/.turbo", "**/.venv", "**/__pycache__", ".git", ".env", ".env.*", "**/dump.rdb", "**/test-results", "**/playwright-report"],
    )
    .run_commands("cd /app && pnpm install --frozen-lockfile && pnpm build")
    .env({"NODE_ENV": "production", "REDIS_URL": "redis://127.0.0.1:6379"})
)

app = modal.App("stage-ready", image=image)


@app.function(cpu=2.0, memory=4096, secrets=[modal.Secret.from_name("stage-ready-app")], max_containers=1, scaledown_window=1200, timeout=24 * 3600)
@modal.concurrent(max_inputs=200)
@modal.web_server(7860, startup_timeout=180, label="stage-ready")
def web() -> None:
    import os
    import subprocess
    import threading

    process = subprocess.Popen(["bash", "deploy/container/start.sh"], cwd="/app")

    # start.sh exits when any service dies; take the container down with it so Modal starts a fresh one.
    def watch() -> None:
        process.wait()
        os._exit(1)

    threading.Thread(target=watch, daemon=True).start()
