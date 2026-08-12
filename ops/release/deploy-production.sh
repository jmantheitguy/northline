#!/usr/bin/env sh
set -eu

# Announce only after the replacement container is healthy. The local marker
# makes retries for an already-announced commit safe.
cd "$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"

git pull --ff-only
commit="$(git rev-parse HEAD)"
version="$(sed -n 's/^export const NORTHLINE_VERSION = "\([^"]*\)";$/\1/p' lib/version.ts)"
subject="$(git log -1 --format=%s)"
summary="${subject#*: }"

if [ -z "$version" ]; then
  echo "Unable to read NORTHLINE_VERSION" >&2
  exit 1
fi

docker compose up -d --build

attempt=0
health=starting
while [ "$attempt" -lt 45 ]; do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' northline 2>/dev/null || true)"
  if [ "$health" = "healthy" ]; then break; fi
  if [ "$health" = "unhealthy" ]; then
    echo "Northline became unhealthy after deployment" >&2
    docker logs --tail 100 northline >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

if [ "$health" != "healthy" ]; then
  echo "Northline did not become healthy before the deployment timeout" >&2
  exit 1
fi

mkdir -p runtime-status
marker="runtime-status/last-announced-deploy"
announced="$(cat "$marker" 2>/dev/null || true)"
if [ "$announced" = "$commit" ]; then
  echo "Deployment $commit is already announced; skipping Discord notification"
  exit 0
fi

docker exec northline node /app/ops/release/announce-discord.mjs "$version" "$commit" "$summary"
printf '%s\n' "$commit" > "$marker"
echo "Deployed and announced $version ($commit)"
