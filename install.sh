#!/usr/bin/env bash
# SMURF PBX — single-shot installer.
#
# This script is idempotent and can be re-run safely.  It will:
#
#   1. Install OS dependencies (apt).
#   2. Create a Python virtualenv under /opt/smurf/.venv with all
#      pinned Python deps.
#   3. Copy the SMURF source tree to /opt/smurf.
#   4. Allow the chosen Python interpreter to bind privileged ports.
#   5. Install and enable a systemd unit that auto-starts SMURF on boot
#      and restarts the service if it ever crashes (built-in watchdog).
#   6. Print the access URLs and default credentials.

set -euo pipefail

PREFIX="${PREFIX:-/opt/smurf}"
SERVICE="${SERVICE:-smurf}"
USER_NAME="${SMURF_USER:-smurf}"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

log() { printf '\033[1;36m[smurf]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[smurf]\033[0m %s\n' "$*" >&2; }
err() { printf '\033[1;31m[smurf]\033[0m %s\n' "$*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  err "Run as root (sudo $0)"
fi

log "Installing system packages…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  python3 python3-venv python3-dev python3-pip \
  build-essential libssl-dev libffi-dev libsrtp2-dev libopus-dev libvpx-dev \
  ffmpeg sox openssl ca-certificates curl iproute2 \
  sqlite3 jq net-tools

log "Creating system user '${USER_NAME}'…"
if ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd --system --home "$PREFIX" --shell /usr/sbin/nologin "$USER_NAME"
fi

log "Copying source tree to ${PREFIX}…"
mkdir -p "$PREFIX"
rsync -a --delete \
  --exclude='.venv' --exclude='.git' --exclude='*.pyc' \
  --exclude='__pycache__' --exclude='data/' --exclude='logs/' \
  --exclude='recordings/' --exclude='voicemail/' --exclude='certs/' \
  "$SOURCE_DIR/" "$PREFIX/"
mkdir -p "$PREFIX/data" "$PREFIX/logs" "$PREFIX/recordings" \
         "$PREFIX/voicemail" "$PREFIX/moh" "$PREFIX/certs"

log "Setting up Python virtualenv…"
python3 -m venv "$PREFIX/.venv"
"$PREFIX/.venv/bin/pip" install --quiet --upgrade pip wheel
"$PREFIX/.venv/bin/pip" install --quiet -r "$PREFIX/requirements.txt"

log "Granting CAP_NET_BIND_SERVICE to python so it can bind ports < 1024…"
PY_BIN="$(readlink -f "$PREFIX/.venv/bin/python3")"
setcap 'cap_net_bind_service=+ep' "$PY_BIN" || warn "setcap failed — SMURF will need root or alternative ports"

log "Setting permissions…"
chown -R "$USER_NAME:$USER_NAME" "$PREFIX"

log "Installing systemd unit /etc/systemd/system/${SERVICE}.service…"
cat > "/etc/systemd/system/${SERVICE}.service" <<UNIT
[Unit]
Description=SMURF PBX (from-scratch SIP/RTP/PBX platform)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
Group=${USER_NAME}
WorkingDirectory=${PREFIX}
Environment=PYTHONUNBUFFERED=1 SMURF_HOME=${PREFIX} SMURF_DATA=${PREFIX}/data SMURF_LOGS=${PREFIX}/logs
ExecStart=${PREFIX}/.venv/bin/python -m smurf.main
Restart=always
RestartSec=3
LimitNOFILE=65536
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=false
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "${SERVICE}.service"
systemctl restart "${SERVICE}.service"
sleep 3
systemctl --no-pager --full status "${SERVICE}.service" | head -20 || true

cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SMURF PBX is running.

   Admin panel  : https://$(hostname -I | awk '{print $1}'):5001/
                  user: admin   password: smurf-admin
   Web softphone: https://$(hostname -I | awk '{print $1}'):5001/softphone
   API docs     : https://$(hostname -I | awk '{print $1}'):5001/api/docs
   SIP          : UDP/TCP 5060, TLS 5061, WS 8088, WSS 8089

   Demo extensions seeded: 1001/smurf1001, 1002/smurf1002, 1003/smurf1003

   Service control:
     systemctl status ${SERVICE}
     systemctl restart ${SERVICE}
     journalctl -u ${SERVICE} -f
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
