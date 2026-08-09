#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_ROOT="${NORTHLINE_APP_ROOT:-/home/johnathan/apps/northline}"
BACKUP_ROOT="${NORTHLINE_BACKUP_ROOT:-/var/backups/northline}"
KEY_FILE="${NORTHLINE_BACKUP_KEY_FILE:-/root/.config/northline-backup.key}"
RETENTION_DAYS="${NORTHLINE_BACKUP_RETENTION_DAYS:-14}"
NAS_ROOT="${NORTHLINE_NAS_ROOT:-}"
NAS_RETENTION_DAYS="${NORTHLINE_NAS_RETENTION_DAYS:-60}"
STATUS_ROOT="${NORTHLINE_STATUS_ROOT:-$APP_ROOT/runtime-status}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d /tmp/northline-backup.XXXXXX)"
ARCHIVE="$BACKUP_ROOT/northline-$STAMP.tar.gz"
ENCRYPTED="$ARCHIVE.enc"

RUNNING_MAIL=()
resume_mail() {
  if (( ${#RUNNING_MAIL[@]} )); then
    docker start "${RUNNING_MAIL[@]}" >/dev/null || true
    RUNNING_MAIL=()
  fi
}
cleanup() { resume_mail; rm -rf -- "$WORK_DIR"; }
report_failure() {
  local code="$?"
  install -d -m 0700 "$STATUS_ROOT" || true
  printf '{"status":"degraded","failedAt":"%s","message":"Backup failed; inspect the host service journal","exitCode":%s}\n' "$(date -u +%FT%TZ)" "$code" > "$STATUS_ROOT/backup.json.tmp" || true
  mv -f -- "$STATUS_ROOT/backup.json.tmp" "$STATUS_ROOT/backup.json" 2>/dev/null || true
  chmod 0644 "$STATUS_ROOT/backup.json" 2>/dev/null || true
  return "$code"
}
trap cleanup EXIT
trap report_failure ERR

install -d -m 0700 "$BACKUP_ROOT" "$(dirname "$KEY_FILE")" "$STATUS_ROOT"
if [[ ! -s "$KEY_FILE" ]]; then
  openssl rand -hex 32 > "$KEY_FILE"
  chmod 0600 "$KEY_FILE"
fi

for container in northline authentik-postgresql-1; do
  docker inspect "$container" >/dev/null 2>&1 || { echo "Required container is unavailable: $container" >&2; exit 1; }
done

install -d -m 0700 "$WORK_DIR/database" "$WORK_DIR/config" "$WORK_DIR/authentik-files" "$WORK_DIR/docker-volumes"

docker exec northline node -e "const Database=require('better-sqlite3');const db=new Database('/app/data/northline.db');db.backup('/tmp/northline-backup.db').then(()=>db.close())"
docker cp northline:/tmp/northline-backup.db "$WORK_DIR/database/northline.db" >/dev/null
docker exec northline rm -f /tmp/northline-backup.db

docker exec authentik-postgresql-1 sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip -9 > "$WORK_DIR/database/authentik.sql.gz"

install -m 0600 "$APP_ROOT/.env" "$WORK_DIR/config/northline.env"
install -m 0600 "$APP_ROOT/infra/authentik/.env" "$WORK_DIR/config/authentik.env"
tar --exclude='.git' -C "$APP_ROOT/infra" -czf "$WORK_DIR/config/mail-infrastructure.tar.gz" mail

for directory in data certs custom-templates; do
  if [[ -d "$APP_ROOT/infra/authentik/$directory" ]]; then
    tar -C "$APP_ROOT/infra/authentik" -cf - "$directory" | tar -C "$WORK_DIR/authentik-files" -xf -
  fi
done

for container in northline-stalwart northline-webmail northline-mail-ingress; do
  if [[ "$(docker inspect "$container" --format '{{.State.Running}}' 2>/dev/null || true)" == "true" ]]; then
    RUNNING_MAIL+=("$container")
  fi
done
if (( ${#RUNNING_MAIL[@]} )); then docker stop "${RUNNING_MAIL[@]}" >/dev/null; fi
for volume in mail_stalwart-config mail_stalwart-data mail_bulwark-config mail_bulwark-state mail_snappymail-data; do
  SOURCE="/var/lib/docker/volumes/$volume/_data"
  [[ -d "$SOURCE" ]] || { echo "Required mail volume is unavailable: $volume" >&2; exit 1; }
  tar -C "$SOURCE" -czf "$WORK_DIR/docker-volumes/$volume.tar.gz" .
done
resume_mail

cat > "$WORK_DIR/manifest.txt" <<EOF
created_utc=$STAMP
northline_commit=$(git -c safe.directory="$APP_ROOT" -C "$APP_ROOT" rev-parse HEAD)
northline_container=$(docker inspect northline --format '{{.Image}}')
authentik_container=$(docker inspect authentik-server-1 --format '{{.Config.Image}}')
stalwart_container=$(docker inspect northline-stalwart --format '{{.Config.Image}}')
webmail_container=$(docker inspect northline-webmail --format '{{.Config.Image}}')
EOF

(cd "$WORK_DIR" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
tar -C "$WORK_DIR" -czf "$ARCHIVE" .
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$ARCHIVE" -out "$ENCRYPTED" -pass "file:$KEY_FILE"
rm -f -- "$ARCHIVE"
chmod 0600 "$ENCRYPTED"

find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'northline-*.tar.gz.enc' -mtime "+$RETENTION_DAYS" -delete
if [[ -n "$NAS_ROOT" ]]; then
  install -d -m 0700 "$NAS_ROOT"
  NAS_FILE="$NAS_ROOT/$(basename "$ENCRYPTED")"
  NAS_TEMP="$NAS_FILE.partial"
  cp -- "$ENCRYPTED" "$NAS_TEMP"
  cmp --silent "$ENCRYPTED" "$NAS_TEMP"
  mv -f -- "$NAS_TEMP" "$NAS_FILE"
  chmod 0600 "$NAS_FILE" || true
  find "$NAS_ROOT" -maxdepth 1 -type f -name 'northline-*.tar.gz.enc' -mtime "+$NAS_RETENTION_DAYS" -delete
fi
STATUS_TEMP="$STATUS_ROOT/backup.json.tmp"
printf '{"status":"healthy","completedAt":"%s","archive":"%s","nasReplicated":%s,"message":"Encrypted backup and verification completed"}\n' "$(date -u +%FT%TZ)" "$(basename "$ENCRYPTED")" "$([[ -n "$NAS_ROOT" ]] && echo true || echo false)" > "$STATUS_TEMP"
mv -f -- "$STATUS_TEMP" "$STATUS_ROOT/backup.json"
chmod 0644 "$STATUS_ROOT/backup.json"
echo "$ENCRYPTED"
