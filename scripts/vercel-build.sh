#!/bin/sh
# Vercel's build command (see vercel.json): brings the database tables up to date, then builds.
set -e

if [ -n "$DATABASE_URL_UNPOOLED$DATABASE_URL" ]; then
  npx prisma migrate deploy
else
  # The very first build can run before Neon is connected. The tables get made on the next deploy.
  echo "DATABASE_URL isn't set yet, so the database tables weren't created. Connect Neon, then redeploy."
fi

npx next build
