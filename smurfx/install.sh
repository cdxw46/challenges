#!/bin/bash
# install.sh - Script de instalación para SMURFX
# Configura el servidor desde cero, instala dependencias, base de datos y despliega la aplicación.

set -e

echo "Iniciando instalación de SMURFX..."

# Actualizar sistema
echo "Actualizando paquetes del sistema..."
sudo apt-get update && sudo apt-get upgrade -y

# Instalar dependencias esenciales
echo "Instalando dependencias (curl, git, nginx, certbot, postgresql, redis, nodejs)..."
sudo apt-get install -y curl git nginx certbot python3-certbot-nginx postgresql postgresql-contrib redis-server build-essential

# Instalar Node.js (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 para gestión de procesos
sudo npm install -g pm2

# Configurar Base de Datos PostgreSQL
echo "Configurando PostgreSQL..."
sudo -u postgres psql -c "CREATE DATABASE smurfx;" || true
sudo -u postgres psql -c "CREATE USER smurfx_user WITH PASSWORD 'smurfx_password';" || true
sudo -u postgres psql -c "ALTER ROLE smurfx_user SET client_encoding TO 'utf8';" || true
sudo -u postgres psql -c "ALTER ROLE smurfx_user SET default_transaction_isolation TO 'read committed';" || true
sudo -u postgres psql -c "ALTER ROLE smurfx_user SET timezone TO 'UTC';" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE smurfx TO smurfx_user;" || true

# Configurar Nginx
echo "Configurando Nginx..."
sudo cat > /etc/nginx/sites-available/smurfx << 'EOF'
server {
    listen 80;
    server_name smurfx.com www.smurfx.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/smurfx /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

echo "Instalación base completada. Para configurar SSL, ejecuta: sudo certbot --nginx -d smurfx.com -d www.smurfx.com"
echo "Recuerda clonar el repositorio, configurar el archivo .env y ejecutar deploy.sh."
