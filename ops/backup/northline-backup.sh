#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_ROOT="${NORTHLINE_APP_ROOT:-/home/johnathan/apps/northline}"
BACKUP_ROOT="${NORTHLINE_BACKUP_ROOT:-/var/backups/northline}"
KEY_FILE="${NORTHLINE_BACKUP_KEY_FILE:-/root/.config/northline-backup.key}"
RETENTION_DAYS="${NORTHLINE_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d /tmp/northline-backup.XXXXXX)"
ARCHIVE="$BACKUP_ROOT/northline-$STAMP.tar.gz"
ENCRYPTED="$ARCHIVE.enc"

cleanup() { rm -rf -- "$WORK_DIR"; }
trap cleanup EXIT

install -d -m 0700 "$BACKUP_ROOT" "$(dirname "$KEY_FILE")"
if [[ ! -s "$KEY_FILE" ]]; then
  openssl rand -hex 32 > "$KEY_FILE"
  chmod 0600 "$KEY_FILE"
fi

for container in northline authentik-postgresql-1; do
  docker inspect "$container" >/dev/null 2>&1 || { echo "Required container is unavailable: $container" >&2; exit 1; }
done

install -d -m 0700 "$WORK_DIR/database" "$WORK_DIR/config" "$WORK_DIR/authentik-files"

docker exec northline node -e "const Database=require('better-sqlite3');const db=new Database('/app/data/northline.db');db.backup('/tmp/northline-backup.db').then(()=>db.close())"
docker cp northline:/tmp/northline-backup.db "$WORK_DIR/database/northline.db" >/dev/null
docker exec northline rm -f /tmp/northline-backup.db

docker exec authentik-postgresql-1 sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip -9 > "$WORK_DIR/database/authentik.sql.gz"

install -m 0600 "$APP_ROOT/.env" "$WORK_DIR/config/northline.env"
install -m 0600 "$APP_ROOT/infra/authentik/.env" "$WORK_DIR/config/authentik.env"

for directory in data certs custom-templates; do
  if [[ -d "$APP_ROOT/infra/authentik/$directory" ]]; then
    tar -C "$APP_ROOT/infra/authentik" -cf - "$directory" | tar -C "$WORK_DIR/authentik-files" -xf -
  fi
done

cat > "$WORK_DIR/manifest.txt" <<EOF
created_utc=$STAMP
northline_commit=$(git -c safe.directory="$APP_ROOT" -C "$APP_ROOT" rev-parse HEAD)
northline_container=$(docker inspect northline --format '{{.Image}}')
authentik_container=$(docker inspect authentik-server-1 --format '{{.Config.Image}}')
EOF

(cd "$WORK_DIR" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
tar -C "$WORK_DIR" -czf "$ARCHIVE" .
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$ARCHIVE" -out "$ENCRYPTED" -pass "file:$KEY_FILE"
rm -f -- "$ARCHIVE"
chmod 0600 "$ENCRYPTED"

find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'northline-*.tar.gz.enc' -mtime "+$RETENTION_DAYS" -delete
echo "$ENCRYPTED"
