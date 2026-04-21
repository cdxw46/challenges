#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/smurfx}"
DOMAIN="${DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
SMURFX_SEED="${SMURFX_SEED:-1}"

sudo apt-get update
sudo apt-get install -y curl git nginx postgresql redis-server ca-certificates gnupg

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo npm install -g pnpm pm2

sudo mkdir -p "$APP_DIR"
sudo rsync -a --delete ./ "$APP_DIR"/
sudo chown -R "$USER":"$USER" "$APP_DIR"

cd "$APP_DIR"
cp -n .env.example .env || true
mkdir -p apps/web
cp -n .env.example apps/web/.env.local || true

sudo service postgresql start
sudo service redis-server start

sudo -u postgres psql -c "CREATE USER smurfx WITH PASSWORD 'smurfx';" 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER smurfx WITH PASSWORD 'smurfx';" || true
sudo -u postgres psql -c "CREATE DATABASE smurfx OWNER smurfx;" 2>/dev/null || true

pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma db push
if [ "$SMURFX_SEED" = "1" ]; then
  pnpm db:seed
fi
pnpm --filter @smurfx/web build

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

sudo cp infra/nginx/smurfx.conf /etc/nginx/sites-available/smurfx
sudo ln -sf /etc/nginx/sites-available/smurfx /etc/nginx/sites-enabled/smurfx
sudo nginx -t
sudo systemctl restart nginx

if [ -n "$DOMAIN" ] && [ -n "$LETSENCRYPT_EMAIL" ]; then
  sudo apt-get install -y certbot python3-certbot-nginx
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" --redirect || true
fi

echo "SMURFX instalado en $APP_DIR"
