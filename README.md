# SMURFX

SMURFX es una tienda online deportiva SSR construida desde cero con Next.js App Router, Prisma 7 y PostgreSQL.

## Stack
- Next.js 16 + React 19
- Prisma 7 + PostgreSQL
- Redis preparado para cache / colas
- Cloudflare Tunnel para previews efimeras
- Nginx como reverse proxy recomendado

## Estructura
- `apps/web`: storefront, area privada, admin, API routes y OpenAPI
- `packages/shared`: branding, tipos y contratos compartidos
- `prisma`: esquema, config y seed del catalogo
- `infra/nginx`: configuracion recomendada de reverse proxy
- `install.sh`: bootstrap de servidor limpio
- `deploy.sh`: despliegue / actualizacion

## Variables de entorno
Copia `.env.example` a `.env` en la raiz y a `apps/web/.env.local` en desarrollo.

Variables clave:
- `DATABASE_URL`
- `JWT_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `SMTP_*`

## Desarrollo local
```bash
pnpm install
pnpm exec prisma generate
pnpm exec prisma db push
pnpm db:seed
pnpm dev
```

## Docker Compose
```bash
docker compose up --build
```

Servicios:
- web: `http://localhost:3000`
- postgres: `localhost:5432`
- redis: `localhost:6379`

## Endpoints utiles
- Storefront: `/`
- Listing hombre: `/hombre`
- PDP ejemplo: `/producto/smurfair-max-one-azul`
- Carrito: `/carrito`
- Checkout: `/checkout`
- Cuenta: `/cuenta`
- Admin: `/admin`
- Health: `/api/health`
- Docs API: `/api/docs`
- OpenAPI JSON: `/api/docs/openapi.json`

## SEO / PWA
- `robots.txt` via `app/robots.ts`
- `sitemap.xml` via `app/sitemap.ts`
- Manifest via `app/manifest.ts`
- Service worker basico en `apps/web/public/sw.js`

## Instalacion en servidor limpio
```bash
chmod +x install.sh deploy.sh
./install.sh
```

Variables opcionales para HTTPS:
- `DOMAIN`
- `LETSENCRYPT_EMAIL`
- `APP_DIR` (default: `/opt/smurfx`)
- `SMURFX_SEED=1` para cargar catalogo inicial

## Despliegue
```bash
./deploy.sh
```

El script actualiza dependencias, sincroniza Prisma, recompila la app y reinicia PM2.

## CI/CD
La workflow `smurfx.yml` valida build en PR/push y despliega en `main` si existen secretos SSH:
- `PROD_HOST`
- `PROD_USER`
- `PROD_PORT`
- `PROD_SSH_KEY`

## Admin inicial
- Email: `admin@smurfx.com`
- Password: `Admin1234!`

Cambia esas credenciales en produccion antes de exponer la tienda.
