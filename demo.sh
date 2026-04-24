#!/usr/bin/env bash
# Quick demo script: boot NEUROVA (orchestrator + simulator) in the
# foreground, without systemd. Useful for quick dev runs.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
export PYTHONPATH="$(pwd)"
export NEUROVA_DATA="$(pwd)/neurova/data"
export NEUROVA_API_PORT="${NEUROVA_API_PORT:-8443}"
export NEUROVA_MQTT_PORT="${NEUROVA_MQTT_PORT:-18830}"
export NEUROVA_SIM_HZ="${NEUROVA_SIM_HZ:-0.2}"

mkdir -p neurova/logs neurova/data
echo "==> starting NEUROVA orchestrator on :$NEUROVA_API_PORT"
python3 -m neurova.api.orchestrator > neurova/logs/orchestrator.log 2>&1 &
ORCH_PID=$!

sleep 5
echo "==> starting simulator"
python3 -m neurova.simulator.service > neurova/logs/simulator.log 2>&1 &
SIM_PID=$!

trap "kill $ORCH_PID $SIM_PID 2>/dev/null || true" EXIT

cat <<EOF

NEUROVA demo is running.
  Orchestrator PID: $ORCH_PID
  Simulator PID:    $SIM_PID
  Command Center:   http://127.0.0.1:$NEUROVA_API_PORT/control/
  Citizen Portal:   http://127.0.0.1:$NEUROVA_API_PORT/ciudad/
  Credentials:      admin@neurova.city / Neurova2025!

Press Ctrl+C to stop.
EOF

wait
