# SMURFX — Move in blue

Tienda online completa construida desde cero con **Next.js 14 (App Router) + TypeScript + Tailwind + Prisma**. Sin
plantillas, sin Shopify, sin WordPress.

## Demo en vivo

URL pública (Cloudflare Tunnel temporal): **https://welding-martin-illinois-alaska.trycloudflare.com**

- Tienda: `/`
- Admin: `/admin` (admin@smurfx.com / Admin1234!)
- Docs API: `/api/docs`
- Sitemap: `/sitemap.xml`

## Características

- Catálogo con líneas SmurfAir, SmurfForce, SmurfRun, SmurfGlide, SmurfTrail.
- Listings con filtros (línea, actividad, talla, color, precio, novedades, sale), ordenación e infinite scroll.
- Página de producto: galería con zoom y lightbox, swatches por color, selector de tallas con stock por variante,
  reviews verificadas, productos relacionados, sticky bar móvil.
- Carrito persistente (Cookie de invitado fusionada al iniciar sesión) con cupones y opciones de envío.
- Checkout multi-paso con **Stripe Payment Element** (más opciones manuales para PayPal/Klarna/Bizum a configurar).
- Cuenta de usuario: pedidos, direcciones, favoritos, perfil, programa SmurfX Members.
- Panel `/admin` protegido con dashboard, productos, pedidos (con cambio de estado y tracking), clientes, cupones y
  contenido.
- Emails transaccionales con HTML branded (SMTP opcional, fallback a `tmp/emails`).
- SEO: metadata dinámica, JSON-LD de producto, `sitemap.xml` y `robots.txt`.
- Headers de seguridad, CSP, rate limiting, sesiones JWT, bcrypt cost 12, tokens de un solo uso.
- API REST documentada en `/api/docs` (Swagger UI servida desde el propio servicio).

## Quick start

```bash
cp .env.example .env
npm install
npx prisma migrate deploy
npm run seed
npm run build
npm start
```

La tienda corre en `http://localhost:3000`.

### Credenciales por defecto

- **Admin**: `admin@smurfx.com` / `Admin1234!` (login en `/cuenta/login`, panel en `/admin`).

### Variables clave

Ver `.env.example`. Para activar pagos reales con Stripe rellena `STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. El checkout funciona en modo manual si Stripe
está deshabilitado.

## Scripts

- `npm run dev` — desarrollo con hot reload.
- `npm run build` — build producción (incluye `prisma generate` + `migrate deploy`).
- `npm start` — servidor producción.
- `npm run seed` — carga 50 productos con variantes/imágenes generadas, categorías, colecciones, cupones y admin.
- `npm run prisma:studio` — explora la BD.

## Despliegue

### Docker

```bash
docker compose up --build
```

### Bare-metal

```bash
sudo ./install.sh
sudo systemctl start smurfx
```

Nginx + Let's Encrypt: ver `deploy/nginx.conf` y `install.sh`.

## Estructura

```
smurfx/
├── prisma/              # schema + seed + migraciones
├── src/
│   ├── app/             # rutas (App Router)
│   ├── components/      # componentes React
│   └── lib/             # auth, prisma, brand, format, mailer, stripe
├── public/              # estáticos
└── deploy/              # nginx, systemd
```
