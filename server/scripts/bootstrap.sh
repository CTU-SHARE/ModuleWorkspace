#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mode="${1:-prod}"
case "$mode" in
 prod) compose() { docker compose "$@"; } ;;
 dev) compose() { docker compose -f compose.yaml -f compose.dev.yaml "$@"; } ;;
 *) echo 'Usage: bootstrap.sh prod|dev'; exit 1 ;;
esac
# The images and dependencies must already be running. Metadata uses a bounded retry.
i=0
until compose --profile setup run --rm metadata; do
 i=$((i+1)); [ "$i" -lt 12 ] || exit 1; sleep 5
done
compose exec -T n8n n8n import:workflow --input=/imports/notifications.json
compose exec -T n8n n8n publish:workflow --id=ShareBaseNotify1
compose restart n8n
printf '%s\n' 'Metadata and notification workflow installed.'
