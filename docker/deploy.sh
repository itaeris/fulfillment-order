#!/bin/sh
set -eu

FRONTEND_IMAGE="${FRONTEND_IMAGE:-itaeris/fulfillment_frontend_app:latest}"
BACKEND_IMAGE="${BACKEND_IMAGE:-itaeris/fulfillment_backend_app:latest}"
NETWORK="${NETWORK:-fulfillment-network}"
ENV_FILE="${ENV_FILE:-/opt/fulfillment/backend.env}"

env_get() {
  key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-
}

recreate() {
  name="$1"
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    echo "Stop + hapus container $name"
    docker stop "$name" >/dev/null 2>&1 || true
    docker rm "$name" >/dev/null 2>&1 || true
  fi
}

join_network() {
  name="${1:-}"
  case "$name" in
    ""|127.0.0.1|localhost|::1) return 0 ;;
  esac
  if docker ps --format '{{.Names}}' | grep -qx "$name"; then
    docker network connect "$NETWORK" "$name" 2>/dev/null || true
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

MYSQL_HOST="$(env_get MYSQL_HOST)"
REDIS_HOST="$(env_get REDIS_HOST)"

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK"
join_network "$MYSQL_HOST"
join_network "$REDIS_HOST"

echo "Pull images"
docker pull "$FRONTEND_IMAGE"
docker pull "$BACKEND_IMAGE"

recreate fulfillment_backend_app
docker run -d \
  --name fulfillment_backend_app \
  --restart unless-stopped \
  --network "$NETWORK" \
  --network-alias host.docker.local \
  -p 2021:80 \
  --env-file "$ENV_FILE" \
  -e API_PORT=4000 \
  "$BACKEND_IMAGE"

recreate fulfillment_frontend_app
docker run -d \
  --name fulfillment_frontend_app \
  --restart unless-stopped \
  --network "$NETWORK" \
  -p 2022:80 \
  --env-file "$ENV_FILE" \
  -e API_URL=http://host.docker.local \
  "$FRONTEND_IMAGE"

echo "Deploy selesai"
echo "Frontend :2022 -> https://fulfillment-fti.aerisbeaute.com"
echo "Backend  :2021 -> host.docker.local"
echo "MySQL/Redis: container existing via MYSQL_HOST / REDIS_HOST"
