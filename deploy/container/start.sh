#!/usr/bin/env bash
# Starts Redis, applies migrations, then web, realtime, worker and the router. If any of them exits, the
# container exits too, so the host starts a fresh one.
set -euo pipefail
cd /app

# PUBLIC_HOST is the app's public host name (e.g. x4yees--stage-ready.modal.run); the public URLs follow from
# it unless set explicitly. Hugging Face Spaces set SPACE_HOST, which works the same way.
host="${PUBLIC_HOST:-${SPACE_HOST:-}}"
if [ -n "$host" ]; then
  export AUTH_URL="${AUTH_URL:-https://$host}"
  export WEB_ORIGIN="${WEB_ORIGIN:-https://$host}"
  export REALTIME_URL="${REALTIME_URL:-wss://$host}"
fi

redis-server --port 6379 --bind 127.0.0.1 --save "" --appendonly no --dir /tmp &
redis_pid=$!
for _ in $(seq 1 50); do redis-cli -p 6379 ping >/dev/null 2>&1 && break; sleep 0.2; done
kill -0 "$redis_pid" 2>/dev/null && redis-cli -p 6379 ping >/dev/null || { echo "Redis did not start." >&2; exit 1; }

pnpm db:migrate

PORT=3000 pnpm --filter @stage-ready/web start &
REALTIME_PORT=4000 pnpm --filter @stage-ready/realtime start &
pnpm --filter @stage-ready/worker start &
node deploy/container/router.mjs &

set +e
wait -n
code=$?
echo "A Stage Ready process exited (code $code); stopping so the host starts a fresh container." >&2
exit 1
