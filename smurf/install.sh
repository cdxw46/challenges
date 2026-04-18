#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="${SMURF_RUNTIME_DIR:-$ROOT_DIR/runtime}"
SYSTEMD_DIR="$ROOT_DIR/deploy/systemd"

mkdir -p "$RUNTIME_DIR"
mkdir -p "$RUNTIME_DIR/tls"

chmod +x "$ROOT_DIR/install.sh" || true

if command -v python3 >/dev/null 2>&1; then
  python3 -m py_compile \
    "$ROOT_DIR"/src/smurf/*.py
else
  echo "python3 is required" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  sudo install -d /etc/systemd/system
  sudo install -d /opt/smurf
  sudo rsync -a --delete "$ROOT_DIR"/ /opt/smurf/
  sudo install -m 0644 "$SYSTEMD_DIR/smurf.service" /etc/systemd/system/smurf.service
  sudo systemctl daemon-reload
  sudo systemctl enable smurf.service
  sudo systemctl restart smurf.service
else
  echo "systemctl not available; skipping unit installation"
fi

echo "SMURF installed."
