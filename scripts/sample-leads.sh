#!/usr/bin/env bash
set -euo pipefail

WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:5678/webhook/lead}"
MOCK_LOGS="${MOCK_LOGS:-http://localhost:3001/logs}"

echo "Posting sample leads to ${WEBHOOK_URL}"
echo

post() {
  local label="$1"
  local payload="$2"
  echo "==> ${label}"
  curl -sS -X POST "${WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "${payload}" | jq . 2>/dev/null || cat
  echo
}

post "Hot enterprise lead" '{
  "name": "Amina Hassan",
  "email": "amina@global-enterprise.io",
  "company": "Global Enterprise Partners",
  "budget_usd": 42000,
  "phone": "+14155550101",
  "source": "referral"
}'

post "Warm SMB lead" '{
  "name": "Ben Ortiz",
  "email": "ben@bright-smb.com",
  "company": "Bright SMB",
  "budget_usd": 12000,
  "phone": "+14155550102",
  "source": "web"
}'

post "Cold lead (academic)" '{
  "name": "Cara Lee",
  "email": "cara@university.edu",
  "company": "State University",
  "budget_usd": 1500,
  "phone": "+14155550103",
  "source": "web"
}'

post "Fallback path demo (simulated OpenAI outage)" '{
  "name": "Dana Kim",
  "email": "dana@startup.io",
  "company": "Launchpad Startup",
  "budget_usd": 18000,
  "phone": "+14155550104",
  "source": "web",
  "simulate_openai_failure": true
}'

echo "Recent mock-service events:"
curl -sS "${MOCK_LOGS}" | jq '.logs[:8]' 2>/dev/null || curl -sS "${MOCK_LOGS}"
