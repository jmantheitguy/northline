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

# Discord release announcements are reserved for semver major-version changes.
# Compare against the deployed commit's parent so patch and minor deployments
# remain silent while a new major release is still announced after health checks.
previous_version="$(git show "${commit}^:lib/version.ts" 2>/dev/null | sed -n 's/^export const NORTHLINE_VERSION = "\([^\"]*\)";$/\1/p' || true)"
current_major="$(printf '%s\n' "$version" | sed -nE 's/.*v([0-9]+)\..*/\1/p')"
previous_major="$(printf '%s\n' "$previous_version" | sed -nE 's/.*v([0-9]+)\..*/\1/p')"

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

# The production image is fully built and healthy at this point. Build cache is
# disposable and grows quickly on a small self-hosted VM, so release it after
# every successful deployment. This does not remove running images, containers,
# named volumes, or application data.
docker builder prune --all --force >/dev/null || echo "Warning: unable to prune Docker build cache" >&2

if [ -z "$current_major" ]; then
  echo "Unable to determine the semver major version" >&2
  exit 1
fi
if [ "$current_major" = "$previous_major" ]; then
  echo "Deployed $version ($commit); Discord announcement skipped because the semver major version did not change"
  exit 0
fi

mkdir -p runtime-status
marker="runtime-status/last-announced-deploy"
channels="$(docker exec northline node -e 'process.stdout.write(process.env.NORTHLINE_RELEASE_CHANNEL_IDS || process.env.NORTHLINE_RELEASE_CHANNEL_ID || "")')"
if [ -z "$channels" ]; then
  echo "Discord release announcements are not configured" >&2
  exit 1
fi

# Keep a marker for each destination. If Discord accepts one message and then
# rejects another, a retry only sends the missing destination instead of
# duplicating the already-delivered announcement.
legacy_announced="$(cat "$marker" 2>/dev/null || true)"
first_channel=""
announcement_failed=0
for channel in $(printf '%s' "$channels" | tr ',' ' '); do
  case "$channel" in
    ''|*[!0-9]*) echo "Invalid Discord release channel configuration" >&2; exit 1 ;;
  esac
  if [ -z "$first_channel" ]; then first_channel="$channel"; fi
  channel_hash="$(printf '%s' "$channel" | sha256sum | cut -c1-16)"
  channel_marker="runtime-status/last-announced-deploy-${channel_hash}"
  announced="$(cat "$channel_marker" 2>/dev/null || true)"
  if [ "$announced" = "$commit" ]; then continue; fi
  # Migrate the old single-destination marker without reposting to its first
  # configured channel. New destinations still receive this deployment.
  if [ "$channel" = "$first_channel" ] && [ "$legacy_announced" = "$commit" ]; then
    printf '%s\n' "$commit" > "$channel_marker"
    continue
  fi
  if docker exec -e "NORTHLINE_RELEASE_CHANNEL_ID=$channel" -e NORTHLINE_RELEASE_CHANNEL_IDS= northline node /app/ops/release/announce-discord.mjs "$version" "$commit" "$summary"; then
    printf '%s\n' "$commit" > "$channel_marker"
  else
    announcement_failed=1
    echo "Release announcement failed for one Discord destination" >&2
  fi
done
if [ "$announcement_failed" -ne 0 ]; then
  exit 1
fi
printf '%s\n' "$commit" > "$marker"
echo "Deployed and announced $version ($commit) to all configured Discord destinations"
