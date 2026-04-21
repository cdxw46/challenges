#!/bin/bash
# deploy.sh - Script de despliegue para SMURFX
# Despliegue sin tiempo de caída usando PM2

set -e

echo "Iniciando despliegue de SMURFX..."

# Variables
APP_DIR="/var/www/smurfx"
BRANCH="main"

# Actualizar código
echo "Actualizando repositorio desde la rama $BRANCH..."
cd $APP_DIR || exit 1
git fetch origin
git reset --hard origin/$BRANCH

# Instalar dependencias y construir Backend
echo "Construyendo backend..."
cd backend
npm install
npm run build
npm run db:migrate || true

# Reiniciar Backend con PM2 (Zero Downtime)
pm2 reload smurfx-backend || pm2 start dist/main.js --name smurfx-backend

# Instalar dependencias y construir Frontend (Next.js)
echo "Construyendo frontend..."
cd ../frontend
npm install
npm run build

# Reiniciar Frontend con PM2 (Zero Downtime)
pm2 reload smurfx-frontend || pm2 start npm --name smurfx-frontend -- start

# Guardar estado de PM2
pm2 save

echo "Despliegue completado con éxito."
