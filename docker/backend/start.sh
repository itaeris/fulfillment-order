#!/bin/sh
set -eu
export API_PORT="${API_PORT:-4000}"
node dist/main.js &
exec nginx -g "daemon off;"
