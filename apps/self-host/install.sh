#!/usr/bin/env sh
# okraPDF self-host installer — durable, parser-agnostic PDF parsing in one command.
#
#   curl -fsSL https://raw.githubusercontent.com/okrapdf/server/main/apps/self-host/install.sh | sh
#
# Brings up the orchestrator + parser containers via docker compose and waits until healthy.
# Env: PORT (default 8787), OKRA_REPO, OKRA_REF.
set -eu

REPO="${OKRA_REPO:-https://github.com/okrapdf/server.git}"
REF="${OKRA_REF:-main}"
PORT="${PORT:-8787}"

say() { printf '\033[1;32m›\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "Docker is required → https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' plugin)."
command -v curl >/dev/null 2>&1 || die "curl is required."

# Run in place if we're already in the project; otherwise fetch it.
if [ -f docker-compose.yml ] && [ -d orchestrator ] && [ -d parsers ]; then
  DIR="$(pwd)"
elif [ -f apps/self-host/docker-compose.yml ]; then
  DIR="$(pwd)/apps/self-host"
else
  command -v git >/dev/null 2>&1 || die "git is required to fetch okraPDF self-host."
  say "Fetching okraPDF self-host ($REPO@$REF)…"
  TARGET="$(pwd)/okra-self-host"
  if [ -d "$TARGET/.git" ]; then
    say "Updating existing clone…"; git -C "$TARGET" pull --ff-only || say "could not fast-forward existing clone — using it as-is"
  else
    git clone --depth 1 --branch "$REF" "$REPO" "$TARGET"
  fi
  if [ -d "$TARGET/apps/self-host" ]; then DIR="$TARGET/apps/self-host"; else DIR="$TARGET"; fi
fi
cd "$DIR" || die "could not enter $DIR"

say "Building + starting containers (orchestrator + parser)…"
PORT="$PORT" docker compose up --build -d

say "Waiting for the orchestrator to become healthy…"
i=0
while [ "$i" -lt 90 ]; do
  if curl -fsS "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    say "okraPDF self-host is up → http://localhost:${PORT}"
    printf '\n  Parse a PDF:\n    curl -s localhost:%s/v1/documents/demo/upload -H "content-type: application/pdf" --data-binary @your.pdf\n    curl -s localhost:%s/v1/documents/demo/graph | jq\n\n  Logs: (cd %s && docker compose logs -f)\n' "$PORT" "$PORT" "$DIR"
    exit 0
  fi
  i=$((i + 1)); sleep 2
done
die "orchestrator did not become healthy in time — check: (cd $DIR && docker compose logs)"
