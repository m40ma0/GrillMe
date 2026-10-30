#!/usr/bin/env bash
# Starts Redis, applies migrations, then web, realtime, worker and the router. If any of them exits, the
# container exits too, so the Space restarts it.
set -euo pipefail
cd /app

# Hugging Face sets SPACE_HOST (<user>-<space>.hf.space); the public URLs follow from it unless set explicitly.
if [ -n "${SPACE_HOST:-}" ]; then
  export AUTH_URL="${AUTH_URL:-https://$SPACE_HOST}"
  export WEB_ORIGIN="${WEB_ORIGIN:-https://$SPACE_HOST}"
  export REALTIME_URL="${REALTIME_URL:-wss://$SPACE_HOST}"
fi

redis-server --port 6379 --bind 127.0.0.1 --save "" --appendonly no --dir /tmp &
redis_pid=$!
for _ in $(seq 1 50); do redis-cli -p 6379 ping >/dev/null 2>&1 && break; sleep 0.2; done
kill -0 "$redis_pid" 2>/dev/null && redis-cli -p 6379 ping >/dev/null || { echo "Redis did not start." >&2; exit 1; }

pnpm db:migrate

PORT=3000 pnpm --filter @stage-ready/web start &
REALTIME_PORT=4000 pnpm --filter @stage-ready/realtime start &
pnpm --filter @stage-ready/worker start &
node deploy/huggingface/router.mjs &

set +e
wait -n
code=$?
echo "A Stage Ready process exited (code $code); stopping the container so the Space restarts it." >&2
exit 1
