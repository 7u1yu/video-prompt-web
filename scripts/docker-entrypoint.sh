#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/data /app/uploads

if [ -z "${SESSION_SECRET:-}" ] || [ "${#SESSION_SECRET}" -lt 32 ]; then
  echo "SESSION_SECRET must be configured with at least 32 characters. Run npm run setup:local first." >&2
  exit 1
fi

npx prisma migrate deploy
npm start -- -H 0.0.0.0
