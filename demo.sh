#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export NEUROVA_RUNTIME_DIR="${NEUROVA_RUNTIME_DIR:-$ROOT_DIR/runtime}"
export NEUROVA_HTTP_PORT="${NEUROVA_HTTP_PORT:-8080}"
export NEUROVA_MQTT_PORT="${NEUROVA_MQTT_PORT:-1883}"
export NEUROVA_AMQP_PORT="${NEUROVA_AMQP_PORT:-5672}"
export NEUROVA_TCP_PORT="${NEUROVA_TCP_PORT:-9100}"
export NEUROVA_UDP_PORT="${NEUROVA_UDP_PORT:-9101}"

mkdir -p "$NEUROVA_RUNTIME_DIR"

if [ ! -x "$ROOT_DIR/target/release/neurova" ]; then
  cargo build --release
fi

echo "[neurova] launching server"
"$ROOT_DIR/target/release/neurova" &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" || true
  fi
}
trap cleanup EXIT

sleep 3

echo "[neurova] launching synthetic city"
"$ROOT_DIR/target/release/neurova" simulate --sensors "${1:-1600}"
