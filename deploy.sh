#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/smurfx}"
cd "$APP_DIR"

git fetch origin
CURRENT_BRANCH="$(git branch --show-current)"
git pull origin "$CURRENT_BRANCH"

pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma db push
pnpm --filter @smurfx/web build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "SMURFX desplegado"
