#!/usr/bin/env bash
# install.sh — pone en marcha SMURFX en un servidor Ubuntu 22.04 LTS limpio.
set -euo pipefail

SMURFX_DIR=${SMURFX_DIR:-/opt/smurfx}
DOMAIN=${DOMAIN:-}

echo "→ Instalando dependencias del sistema (sudo)"
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates gnupg build-essential nginx git ufw

if ! command -v node >/dev/null 2>&1; then
  echo "→ Instalando Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "→ Instalando aplicación en $SMURFX_DIR"
sudo mkdir -p "$SMURFX_DIR"
sudo chown -R "$USER:$USER" "$SMURFX_DIR"
rsync -a --delete --exclude node_modules --exclude .next --exclude prisma/dev.db ./ "$SMURFX_DIR/"
cd "$SMURFX_DIR"
[ -f .env ] || cp .env.example .env
npm install --production=false --no-audit --no-fund
npx prisma migrate deploy
npm run seed || true
npm run build

echo "→ systemd unit"
sudo tee /etc/systemd/system/smurfx.service >/dev/null <<UNIT
[Unit]
Description=SMURFX Next.js app
After=network.target
[Service]
Type=simple
User=$USER
WorkingDirectory=$SMURFX_DIR
Environment=NODE_ENV=production
EnvironmentFile=$SMURFX_DIR/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now smurfx

if [ -n "$DOMAIN" ]; then
  echo "→ Configurando Nginx para $DOMAIN"
  sudo cp deploy/nginx.conf /etc/nginx/sites-available/smurfx
  sudo sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/sites-available/smurfx
  sudo ln -sf /etc/nginx/sites-available/smurfx /etc/nginx/sites-enabled/smurfx
  sudo nginx -t && sudo systemctl reload nginx
  if command -v certbot >/dev/null 2>&1; then
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@"$DOMAIN" || true
  else
    sudo apt-get install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@"$DOMAIN" || true
  fi
fi

echo "✓ SMURFX instalado. Servicio: systemctl status smurfx"
