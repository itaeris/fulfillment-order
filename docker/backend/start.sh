#!/bin/sh
set -eu
export API_PORT="${API_PORT:-4000}"
if [ -f /app/scripts/migrate.mjs ]; then
  node /app/scripts/migrate.mjs || echo "migrate skipped"
fi
node dist/main.js &
exec nginx -g "daemon off;"
