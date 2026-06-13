#!/bin/sh
# NXS OS production launcher — used by the com.nxs.os launchd service.
# Waits for Docker/Postgres, then runs the built API (which also serves
# the built frontend) on port 8080.
cd "$(dirname "$0")/.." || exit 1

i=0
until docker start nxs-postgres >/dev/null 2>&1; do
  i=$((i+1)); [ $i -ge 30 ] && echo "postgres unavailable, continuing anyway" && break
  sleep 3
done

cd artifacts/api-server || exit 1
exec /usr/local/bin/node --enable-source-maps --env-file-if-exists=../../.env ./dist/index.mjs
