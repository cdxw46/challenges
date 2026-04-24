#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="${NEUROVA_RUNTIME_DIR:-/var/lib/neurova}"
INSTALL_PREFIX="${NEUROVA_INSTALL_PREFIX:-/opt/neurova}"
SYSTEMD_DIR="/etc/systemd/system"
NGINX_SITE="/etc/nginx/sites-available/neurova.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/neurova.conf"

echo "[neurova] installing system packages"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  build-essential \
  pkg-config \
  libssl-dev \
  curl \
  nginx \
  openssl \
  ca-certificates

if ! command -v cargo >/dev/null 2>&1; then
  echo "[neurova] installing rust toolchain"
  curl https://sh.rustup.rs -sSf | sh -s -- -y
  source "$HOME/.cargo/env"
fi

echo "[neurova] building release binary"
cd "$ROOT_DIR"
cargo build --release

echo "[neurova] preparing install directories"
sudo mkdir -p "$INSTALL_PREFIX" "$RUNTIME_DIR"
sudo useradd --system --create-home --home-dir /var/lib/neurova --shell /usr/sbin/nologin neurova 2>/dev/null || true
sudo cp -r web docs deploy README.md Cargo.toml Cargo.lock src demo.sh install.sh docker-compose.yml "$INSTALL_PREFIX"/
sudo cp target/release/neurova "$INSTALL_PREFIX"/neurova
sudo chown -R neurova:neurova "$INSTALL_PREFIX"
sudo chown -R neurova:neurova "$RUNTIME_DIR"

echo "[neurova] configuring nginx"
sudo mkdir -p /etc/nginx/ssl
if [[ ! -f /etc/nginx/ssl/neurova.crt || ! -f /etc/nginx/ssl/neurova.key ]]; then
  sudo openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/neurova.key \
    -out /etc/nginx/ssl/neurova.crt \
    -subj "/CN=localhost"
fi
sudo cp "$ROOT_DIR/deploy/nginx/neurova.conf" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" "$NGINX_ENABLED"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "[neurova] configuring systemd"
sudo cp "$ROOT_DIR/deploy/systemd/neurova.service" "$SYSTEMD_DIR/neurova.service"
sudo systemctl daemon-reload
sudo systemctl enable neurova
sudo systemctl restart neurova

echo "[neurova] installation complete"
echo "control: https://localhost/control/"
echo "ciudad:  https://localhost/ciudad/"
echo "api:     https://localhost/api/docs"
