#!/bin/sh
set -eu
export PORT=3000
export HOSTNAME=0.0.0.0
export API_URL="${API_URL:-http://host.docker.local}"
node server.js &
exec nginx -g "daemon off;"
