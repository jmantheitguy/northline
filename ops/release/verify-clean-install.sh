#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAG="northline-clean-install-test:local"
NAME="northline-clean-install-$RANDOM"
VOLUME="${NAME}-data"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; docker volume rm "$VOLUME" >/dev/null 2>&1 || true; docker image rm "$TAG" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker build -t "$TAG" "$ROOT"
docker volume create "$VOLUME" >/dev/null
docker run -d --name "$NAME" -e NORTHLINE_ADMIN_EMAIL=clean-install@example.invalid -e NORTHLINE_ADMIN_PASSWORD=clean-install-password-only -e NORTHLINE_DATA_DIR=/app/data -v "$VOLUME:/app/data" "$TAG" >/dev/null
for _ in $(seq 1 40);do if docker exec "$NAME" node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))";then break;fi;sleep 1;done
docker exec "$NAME" node -e "const D=require('better-sqlite3');const d=new D('/app/data/northline.db');if(d.pragma('integrity_check',{simple:true})!=='ok')process.exit(1);const v=d.prepare('select max(version) v from schema_migrations').get().v;if(v<8)process.exit(1);console.log('Clean install verified at schema v'+v)"
