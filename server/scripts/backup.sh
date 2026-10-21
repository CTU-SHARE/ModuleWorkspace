#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
# Maintenance window: block writers before taking both DB and object snapshots.
docker compose stop gateway core worker n8n hasura logto minio
trap 'docker compose start minio logto hasura n8n core worker gateway' EXIT
docker compose exec -T db pg_dumpall -U postgres > "backups/database-$stamp.sql"
docker compose --profile backup run --rm --no-deps backup-objects -czf "/backup/objects-$stamp.tgz" -C /data .
printf '%s\n' 'Back up .env separately using encrypted storage; it contains n8n encryption keys.'
