#!/usr/bin/env bash
# Publishes the demo workflow inside the n8n container (n8n v2+).
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
NAME="${WORKFLOW_NAME:-Lead Automation Demo}"

WF_ID=$(sudo docker compose -f "$COMPOSE_FILE" exec -T n8n n8n list:workflow 2>/dev/null | grep "$NAME" | cut -d'|' -f1 | head -1)

if [[ -z "$WF_ID" ]]; then
  echo "Workflow '${NAME}' not found in n8n container."
  exit 1
fi

sudo docker compose -f "$COMPOSE_FILE" exec -T n8n n8n publish:workflow --id="$WF_ID"
sudo docker compose -f "$COMPOSE_FILE" restart n8n
echo "Published ${WF_ID}; restarted n8n."
