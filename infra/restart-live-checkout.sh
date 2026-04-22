#!/usr/bin/env bash

set -euo pipefail

CHECKOUT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"

log() {
  printf '[deploy] %s\n' "$*"
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    printf 'Missing required file: %s\n' "$path" >&2
    exit 1
  fi
}

stop_pid_file() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    log "stopping pid from $(basename "$pid_file"): $pid"
    kill "$pid" || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
}

stop_port() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  fi
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-20}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  printf 'Timed out waiting for %s\n' "$url" >&2
  return 1
}

if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
  nvm use 22 >/dev/null || true
fi

cd "$CHECKOUT_DIR"

require_file "apps/api/.env"
require_file "apps/web/.env.local"

log "using checkout $(pwd)"
log "installing dependencies"
pnpm install --frozen-lockfile

log "running database migrations"
set -a
. apps/api/.env
set +a
pnpm db:migrate

log "building production assets"
pnpm build

stop_pid_file "$CHECKOUT_DIR/api.pid"
stop_pid_file "$CHECKOUT_DIR/web.pid"
stop_port "$API_PORT"
stop_port "$WEB_PORT"
sleep 2

log "starting api"
nohup bash -lc "cd '$CHECKOUT_DIR/apps/api' && set -a && . .env && set +a && exec node dist/server.js" \
  > "$CHECKOUT_DIR/api.log" 2>&1 &
echo $! > "$CHECKOUT_DIR/api.pid"

log "starting web"
nohup bash -lc "cd '$CHECKOUT_DIR/apps/web' && export PORT='$WEB_PORT' && exec node node_modules/next/dist/bin/next start" \
  > "$CHECKOUT_DIR/web.log" 2>&1 &
echo $! > "$CHECKOUT_DIR/web.pid"

log "waiting for health checks"
wait_for_http "http://127.0.0.1:${API_PORT}/health"
wait_for_http "http://127.0.0.1:${WEB_PORT}"

log "api pid $(cat "$CHECKOUT_DIR/api.pid")"
log "web pid $(cat "$CHECKOUT_DIR/web.pid")"
log "deployment restart complete"
