#!/bin/sh
# Container entrypoint: apply migrations, run the idempotent seed (roles, categories, plans,
# bootstrap admin), then start the API. Set RUN_SEED_ON_START=false to skip the seed.
set -e
npx prisma migrate deploy
if [ "${RUN_SEED_ON_START:-true}" = "true" ]; then
  npx tsx prisma/seed.ts
fi
exec node dist/main.js
