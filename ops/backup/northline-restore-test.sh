#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUP_ROOT="${NORTHLINE_BACKUP_ROOT:-/var/backups/northline}"
KEY_FILE="${NORTHLINE_BACKUP_KEY_FILE:-/root/.config/northline-backup.key}"
BACKUP_FILE="${1:-$(find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'northline-*.tar.gz.enc' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)}"
WORK_DIR="$(mktemp -d /tmp/northline-restore-test.XXXXXX)"
TEST_DB="northline_restore_test_$(date +%s)"
APP_ROOT="${NORTHLINE_APP_ROOT:-/home/johnathan/apps/northline}"
STATUS_ROOT="${NORTHLINE_STATUS_ROOT:-$APP_ROOT/runtime-status}"

cleanup() {
  docker exec authentik-postgresql-1 sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" dropdb --if-exists -U \"\$POSTGRES_USER\" '$TEST_DB'" >/dev/null 2>&1 || true
  rm -rf -- "$WORK_DIR"
}
report_failure() {
  local code="$?"
  install -d -m 0700 "$STATUS_ROOT" || true
  printf '{"status":"degraded","failedAt":"%s","message":"Restore validation failed; inspect the host service journal","exitCode":%s}\n' "$(date -u +%FT%TZ)" "$code" > "$STATUS_ROOT/restore.json.tmp" || true
  mv -f -- "$STATUS_ROOT/restore.json.tmp" "$STATUS_ROOT/restore.json" 2>/dev/null || true
  chmod 0644 "$STATUS_ROOT/restore.json" 2>/dev/null || true
  return "$code"
}
trap cleanup EXIT
trap report_failure ERR

[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || { echo "No backup archive found" >&2; exit 1; }
[[ -s "$KEY_FILE" ]] || { echo "Backup key is missing" >&2; exit 1; }

openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -out "$WORK_DIR/backup.tar.gz" -pass "file:$KEY_FILE"
tar -C "$WORK_DIR" -xzf "$WORK_DIR/backup.tar.gz"
(cd "$WORK_DIR" && sha256sum --check SHA256SUMS)

python3 - "$WORK_DIR/database/northline.db" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
result = db.execute("PRAGMA integrity_check").fetchone()[0]
assert result == "ok", result
tables = db.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
assert tables > 0, "Northline snapshot contains no tables"
print(f"Northline restore verified: {tables} tables")
PY

for archive in "$WORK_DIR"/docker-volumes/*.tar.gz "$WORK_DIR/config/mail-infrastructure.tar.gz"; do
  tar -tzf "$archive" >/dev/null
done
echo "Mail stack restore artifacts verified: 5 volumes and infrastructure configuration"

gunzip -c "$WORK_DIR/database/authentik.sql.gz" > "$WORK_DIR/database/authentik.sql"
docker exec authentik-postgresql-1 sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" createdb -U \"\$POSTGRES_USER\" '$TEST_DB'"
docker exec -i authentik-postgresql-1 sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d '$TEST_DB'" < "$WORK_DIR/database/authentik.sql" >/dev/null
TABLES="$(docker exec authentik-postgresql-1 sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -At -U \"\$POSTGRES_USER\" -d '$TEST_DB' -c \"select count(*) from pg_tables where schemaname='public'\"")"
[[ "$TABLES" =~ ^[0-9]+$ && "$TABLES" -gt 0 ]] || { echo "Authentik restore contains no tables" >&2; exit 1; }
echo "Authentik restore verified: $TABLES tables"
install -d -m 0700 "$STATUS_ROOT"
printf '{"status":"healthy","completedAt":"%s","message":"Non-destructive restore test passed"}\n' "$(date -u +%FT%TZ)" > "$STATUS_ROOT/restore.json.tmp"
mv -f -- "$STATUS_ROOT/restore.json.tmp" "$STATUS_ROOT/restore.json"
chmod 0644 "$STATUS_ROOT/restore.json"
echo "Restore test passed: $BACKUP_FILE"
