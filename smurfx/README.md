# SMURFX - E-commerce Platform

Bienvenido al repositorio de SMURFX, la plataforma de comercio electrónico de alto rendimiento, construida desde cero.

## Arquitectura

- **Frontend:** Next.js (App Router), React, Tailwind CSS, TypeScript.
- **Backend:** Node.js, Express, TypeScript, Prisma ORM.
- **Base de Datos:** PostgreSQL.
- **Caché:** Redis.
- **Infraestructura:** Nginx, Docker, PM2.

## Estructura del Proyecto

- `/frontend`: Aplicación Next.js (Tienda y Admin).
- `/backend`: API RESTful en Node.js.
- `/admin`: (Opcional) Panel de administración separado (actualmente integrado en la visión general o como proyecto Next.js).
- `docker-compose.yml`: Configuración para desarrollo local.
- `install.sh`: Script de instalación para servidor Ubuntu de producción.
- `deploy.sh`: Script de despliegue continuo (Zero Downtime).

## Desarrollo Local

1. Copia `.env.example` a `.env` en la raíz, y también en `/backend` y `/frontend`.
2. Levanta los servicios de base de datos con Docker:
   ```bash
   docker-compose up -d db redis
   ```
3. Instala dependencias en el backend y ejecuta las migraciones:
   ```bash
   cd backend
   npm install
   npx prisma migrate dev --name init
   npm run dev
   ```
4. Instala dependencias en el frontend y arranca el servidor de desarrollo:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Despliegue en Producción

1. En un servidor Ubuntu 22.04 limpio, clona este repositorio.
2. Ejecuta el script de instalación:
   ```bash
   sudo ./install.sh
   ```
3. Configura tus variables de entorno en `/var/www/smurfx/.env`.
4. Ejecuta el script de despliegue:
   ```bash
   ./deploy.sh
   ```

## Notas de Desarrollo

- Se ha configurado el esquema de base de datos inicial con Prisma, cubriendo Usuarios, Productos, Categorías, Pedidos, Carrito, Reviews y Wishlist.
- El frontend está inicializado con Next.js 14+ y Tailwind CSS.
- El backend tiene una estructura básica de Express lista para expandir los endpoints REST.
