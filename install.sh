#!/usr/bin/env bash
set -euo pipefail

# NEUROVA installer — zero-external-dependency deployment for Ubuntu 22.04/24.04.
# Installs the system packages, generates the TLS cert, configures nginx,
# writes systemd units for the orchestrator + simulator, and starts them.
# Run as: sudo ./install.sh

NEUROVA_HOME=${NEUROVA_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}
NEUROVA_USER=${NEUROVA_USER:-$(whoami)}
NEUROVA_DATA=${NEUROVA_DATA:-${NEUROVA_HOME}/neurova/data}
NEUROVA_LOGS=${NEUROVA_LOGS:-${NEUROVA_HOME}/neurova/logs}
TLS_DIR=${TLS_DIR:-${NEUROVA_HOME}/neurova/tls}

echo "==> NEUROVA installer"
echo "    home=${NEUROVA_HOME}"
echo "    user=${NEUROVA_USER}"
echo "    data=${NEUROVA_DATA}"

need_sudo() {
  if [[ $EUID -ne 0 ]]; then
    echo "Elevating: $*"
    sudo "$@"
  else
    "$@"
  fi
}

echo "==> Installing system packages"
need_sudo apt-get update -y -q
need_sudo apt-get install -y -q \
  nginx python3 python3-pip python3-venv python3-dev build-essential \
  openssl ca-certificates procps net-tools sqlite3 libssl-dev \
  pkg-config

mkdir -p "$NEUROVA_DATA" "$NEUROVA_LOGS" "$TLS_DIR"

echo "==> Generating TLS certificate (self-signed if not present)"
if [[ ! -f "$TLS_DIR/neurova.crt" ]]; then
  need_sudo openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$TLS_DIR/neurova.key" \
    -out    "$TLS_DIR/neurova.crt" \
    -days 825 \
    -subj "/C=ES/O=NEUROVA/CN=neurova.local" \
    -addext "subjectAltName=DNS:localhost,DNS:neurova.local,IP:127.0.0.1"
  need_sudo chmod 640 "$TLS_DIR/neurova.key"
fi

echo "==> Installing nginx profile"
need_sudo cp "$NEUROVA_HOME/neurova/ops/nginx-neurova.conf" /etc/nginx/nginx-neurova.conf
need_sudo nginx -t -c /etc/nginx/nginx-neurova.conf

echo "==> Writing systemd units"
cat <<EOF | need_sudo tee /etc/systemd/system/neurova-orchestrator.service >/dev/null
[Unit]
Description=NEUROVA Orchestrator
After=network.target

[Service]
Type=simple
User=${NEUROVA_USER}
Environment=PYTHONPATH=${NEUROVA_HOME}
Environment=NEUROVA_DATA=${NEUROVA_DATA}
Environment=NEUROVA_API_PORT=8443
Environment=NEUROVA_MQTT_PORT=18830
WorkingDirectory=${NEUROVA_HOME}
ExecStart=/usr/bin/python3 -m neurova.api.orchestrator
Restart=on-failure
RestartSec=5s
StandardOutput=append:${NEUROVA_LOGS}/orchestrator.log
StandardError=append:${NEUROVA_LOGS}/orchestrator.log

[Install]
WantedBy=multi-user.target
EOF

cat <<EOF | need_sudo tee /etc/systemd/system/neurova-simulator.service >/dev/null
[Unit]
Description=NEUROVA Sensor Simulator
After=neurova-orchestrator.service
Requires=neurova-orchestrator.service

[Service]
Type=simple
User=${NEUROVA_USER}
Environment=PYTHONPATH=${NEUROVA_HOME}
Environment=NEUROVA_SIM_HZ=0.2
Environment=NEUROVA_MQTT_HOST=127.0.0.1
Environment=NEUROVA_MQTT_PORT=18830
WorkingDirectory=${NEUROVA_HOME}
ExecStart=/usr/bin/python3 -m neurova.simulator.service
Restart=on-failure
RestartSec=5s
StandardOutput=append:${NEUROVA_LOGS}/simulator.log
StandardError=append:${NEUROVA_LOGS}/simulator.log

[Install]
WantedBy=multi-user.target
EOF

cat <<EOF | need_sudo tee /etc/systemd/system/neurova-nginx.service >/dev/null
[Unit]
Description=NEUROVA nginx proxy
After=neurova-orchestrator.service

[Service]
Type=forking
ExecStart=/usr/sbin/nginx -c /etc/nginx/nginx-neurova.conf
ExecReload=/usr/sbin/nginx -c /etc/nginx/nginx-neurova.conf -s reload
ExecStop=/usr/sbin/nginx -c /etc/nginx/nginx-neurova.conf -s stop
PIDFile=/run/nginx-neurova.pid
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

echo "==> Enabling services"
need_sudo systemctl daemon-reload
need_sudo systemctl enable neurova-orchestrator.service neurova-simulator.service neurova-nginx.service || true

echo "==> Starting services"
need_sudo systemctl restart neurova-orchestrator.service
need_sudo systemctl restart neurova-simulator.service
need_sudo systemctl restart neurova-nginx.service || true

echo "==> Waiting for health..."
for i in $(seq 1 30); do
  if curl -sk https://127.0.0.1/health | grep -q '"status": "ok"'; then
    echo "==> NEUROVA is healthy."
    break
  fi
  sleep 1
done

echo
echo "NEUROVA installation complete."
echo " - Command Center: https://127.0.0.1/control/   admin@neurova.city / Neurova2025!"
echo " - Portal ciudadano: https://127.0.0.1/ciudad/"
echo " - API docs: https://127.0.0.1/api/docs"
echo " - API openapi: https://127.0.0.1/api/openapi.json"
echo " - Logs in: ${NEUROVA_LOGS}"
