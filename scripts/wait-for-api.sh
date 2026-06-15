#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${LIVE_API_BASE_URL:-http://localhost:3002/api}"
TIMEOUT_SECONDS="${LIVE_WAIT_TIMEOUT_SECONDS:-60}"

echo "Waiting for ${API_BASE_URL}/health (timeout ${TIMEOUT_SECONDS}s)..."

for ((i = 0; i < TIMEOUT_SECONDS; i++)); do
  if curl -fsS "${API_BASE_URL}/health" >/dev/null 2>&1; then
    echo "API is healthy."
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for API."
exit 1
