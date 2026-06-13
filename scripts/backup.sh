#!/bin/sh
# Nightly NXS OS database backup (com.nxs.backup launchd job, 03:30).
# Keeps the last 14 dumps in ~/NXS-Backups.
set -e
DIR="$HOME/NXS-Backups"
mkdir -p "$DIR"
docker exec nxs-postgres pg_dump -U nxs nxs | gzip > "$DIR/nxs-$(date +%Y%m%d-%H%M).sql.gz"
ls -t "$DIR"/nxs-*.sql.gz 2>/dev/null | tail -n +15 | xargs rm -f 2>/dev/null || true
