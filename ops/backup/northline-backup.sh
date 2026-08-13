#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_ROOT="${NORTHLINE_APP_ROOT:-/home/johnathan/apps/northline}"
BACKUP_ROOT="${NORTHLINE_BACKUP_ROOT:-/var/backups/northline}"
KEY_FILE="${NORTHLINE_BACKUP_KEY_FILE:-/root/.config/northline-backup.key}"
KEEP_COUNT="${NORTHLINE_BACKUP_KEEP_COUNT:-4}"
NAS_ROOT="${NORTHLINE_NAS_ROOT:-}"
NAS_KEEP_COUNT="${NORTHLINE_NAS_KEEP_COUNT:-$KEEP_COUNT}"
STATUS_ROOT="${NORTHLINE_STATUS_ROOT:-$APP_ROOT/runtime-status}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d /tmp/northline-backup.XXXXXX)"
ARCHIVE="$BACKUP_ROOT/northline-$STAMP.tar.gz"
ENCRYPTED="$ARCHIVE.enc"

keep_newest_backups() {
  local root="$1" count="$2"
  [[ "$count" =~ ^[1-9][0-9]*$ ]] || { echo "Backup keep count must be a positive integer" >&2; return 1; }
  find "$root" -maxdepth 1 -type f -name 'northline-*.tar.gz.enc' -printf '%f\n' \
    | sort -r \
    | tail -n "+$((count + 1))" \
    | while IFS= read -r archive; do
        [[ -n "$archive" ]] && rm -f -- "$root/$archive"
      done
}

cleanup() { rm -rf -- "$WORK_DIR"; }
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

docker inspect northline >/dev/null 2>&1 || { echo "Northline container is unavailable" >&2; exit 1; }

install -d -m 0700 "$WORK_DIR/database" "$WORK_DIR/config"

docker exec northline node -e "const Database=require('better-sqlite3');const db=new Database('/app/data/northline.db');db.backup('/tmp/northline-backup.db').then(()=>db.close())"
docker cp northline:/tmp/northline-backup.db "$WORK_DIR/database/northline.db" >/dev/null
docker exec northline rm -f /tmp/northline-backup.db

install -m 0600 "$APP_ROOT/.env" "$WORK_DIR/config/northline.env"

cat > "$WORK_DIR/manifest.txt" <<EOF
created_utc=$STAMP
backup_scope=northline-only
northline_commit=$(git -c safe.directory="$APP_ROOT" -C "$APP_ROOT" rev-parse HEAD)
northline_container=$(docker inspect northline --format '{{.Image}}')
EOF

(cd "$WORK_DIR" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
tar -C "$WORK_DIR" -czf "$ARCHIVE" .
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$ARCHIVE" -out "$ENCRYPTED" -pass "file:$KEY_FILE"
rm -f -- "$ARCHIVE"
chmod 0600 "$ENCRYPTED"

if [[ -n "$NAS_ROOT" ]]; then
  install -d -m 0700 "$NAS_ROOT"
  NAS_FILE="$NAS_ROOT/$(basename "$ENCRYPTED")"
  NAS_TEMP="$NAS_FILE.partial"
  cp -- "$ENCRYPTED" "$NAS_TEMP"
  cmp --silent "$ENCRYPTED" "$NAS_TEMP"
  mv -f -- "$NAS_TEMP" "$NAS_FILE"
  chmod 0600 "$NAS_FILE" || true
  keep_newest_backups "$NAS_ROOT" "$NAS_KEEP_COUNT"
fi
keep_newest_backups "$BACKUP_ROOT" "$KEEP_COUNT"
STATUS_TEMP="$STATUS_ROOT/backup.json.tmp"
printf '{"status":"healthy","completedAt":"%s","archive":"%s","nasReplicated":%s,"message":"Encrypted backup and verification completed"}\n' "$(date -u +%FT%TZ)" "$(basename "$ENCRYPTED")" "$([[ -n "$NAS_ROOT" ]] && echo true || echo false)" > "$STATUS_TEMP"
mv -f -- "$STATUS_TEMP" "$STATUS_ROOT/backup.json"
chmod 0644 "$STATUS_ROOT/backup.json"
echo "$ENCRYPTED"
