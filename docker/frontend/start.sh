#!/bin/sh
set -eu
export PORT=3000
export HOSTNAME=0.0.0.0
export API_URL="${API_URL:-http://host.docker.local}"
if [ -f /app/scripts/migrate.mjs ]; then
  node /app/scripts/migrate.mjs || echo "migrate skipped"
fi
node server.js &
exec nginx -g "daemon off;"
