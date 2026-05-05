#!/usr/bin/env bash
set -euo pipefail
SMURFX_DIR=${SMURFX_DIR:-/opt/smurfx}
cd "$SMURFX_DIR"
echo "→ git pull"
git pull --ff-only
echo "→ install + build"
npm install --no-audit --no-fund
npx prisma migrate deploy
npm run build
echo "→ restart service"
sudo systemctl restart smurfx
echo "✓ Despliegue completado"
