#!/bin/sh
# Single-container boot (see Dockerfile): liteparse (parser) in the background on
# loopback :8080, wait until it's healthy, then exec the orchestrator (workerd)
# in the foreground on :8787. The orchestrator is PID 1 so the host tracks it.
set -eu

echo "[start] launching liteparse parser on 127.0.0.1:8080"
# Pin liteparse to 8080 explicitly so it ignores any injected PORT (=8787).
( cd /app/liteparse && PORT=8080 node server.mjs ) &

echo "[start] waiting for liteparse /health ..."
i=0
while [ "$i" -lt 60 ]; do
  if node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "[start] liteparse is healthy"
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ "$i" -ge 60 ]; then
  echo "[start] WARNING: liteparse did not become healthy in 60s; continuing anyway"
fi

echo "[start] launching orchestrator (workerd) on 0.0.0.0:8787"
cd /app/orchestrator
exec npx --no-install wrangler dev --ip 0.0.0.0 --port 8787 --persist-to /data
