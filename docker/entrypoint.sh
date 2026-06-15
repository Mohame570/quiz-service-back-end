#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting API on port ${PORT:-3000}..."
exec node dist/main.js
