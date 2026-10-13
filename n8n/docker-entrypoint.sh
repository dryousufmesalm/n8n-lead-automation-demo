#!/bin/sh
set -e

IMPORT_MARKER=/home/node/.n8n/.workflow_imported_v2
if [ ! -f "$IMPORT_MARKER" ]; then
  echo "Importing Lead Automation Demo workflow..."
  n8n import:workflow --input=/import/lead-automation.json
  touch "$IMPORT_MARKER"
fi

WF_ID=$(n8n list:workflow 2>/dev/null | grep 'Lead Automation Demo' | cut -d'|' -f1 | head -1)
if [ -n "$WF_ID" ]; then
  echo "Publishing workflow $WF_ID"
  n8n publish:workflow --id="$WF_ID" || true
fi

exec n8n start
