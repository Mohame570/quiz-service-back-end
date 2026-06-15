#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Starting Postgres + MailHog + API (Docker Compose)"
docker compose up -d --build postgres mailhog api

echo "==> Waiting for API health"
bash scripts/wait-for-api.sh

echo "==> Applying migrations (host) and seeding database"
npm run prisma:migrate:deploy
npm run db:seed

echo "==> Running live server tests"
LIVE_TESTS=1 npm run test:live

echo "Live smoke tests passed."
