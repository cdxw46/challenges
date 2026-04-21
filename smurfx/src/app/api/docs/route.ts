export const dynamic = "force-dynamic";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "SMURFX API",
    version: "1.0.0",
    description: "API REST de la tienda SMURFX. Todos los endpoints aceptan/responden JSON salvo indicación."
  },
  servers: [{ url: "/api" }],
  paths: {
    "/health": { get: { summary: "Healthcheck" } },
    "/products": {
      get: {
        summary: "Listar productos",
        parameters: [
          { name: "q", in: "query" },
          { name: "gender", in: "query" },
          { name: "activity", in: "query" },
          { name: "line", in: "query" },
          { name: "collection", in: "query" },
          { name: "sale", in: "query" },
          { name: "new", in: "query" },
          { name: "min", in: "query" },
          { name: "max", in: "query" },
          { name: "size", in: "query" },
          { name: "color", in: "query" },
          { name: "sort", in: "query" },
          { name: "limit", in: "query" },
          { name: "cursor", in: "query" }
        ]
      }
    },
    "/products/{slug}": { get: { summary: "Detalle de producto" } },
    "/search/suggest": { get: { summary: "Sugerencias de búsqueda (autocompletado)" } },
    "/cart": {
      get: { summary: "Obtener carrito" },
      post: { summary: "Añadir item al carrito" },
      patch: { summary: "Actualizar cantidad" },
      delete: { summary: "Eliminar item" }
    },
    "/cart/coupon": {
      post: { summary: "Aplicar cupón" },
      delete: { summary: "Quitar cupón" }
    },
    "/checkout": { post: { summary: "Iniciar pago (devuelve clientSecret de Stripe si aplica)" } },
    "/checkout/confirm": { post: { summary: "Confirmar el pedido tras éxito de pago" } },
    "/webhooks/stripe": { post: { summary: "Webhook de Stripe" } },
    "/auth/register": { post: { summary: "Registro" } },
    "/auth/login": { post: { summary: "Login" } },
    "/auth/logout": { post: { summary: "Logout" } },
    "/auth/me": { get: { summary: "Sesión actual" } },
    "/auth/forgot": { post: { summary: "Pedir email de recuperación" } },
    "/auth/reset": { post: { summary: "Reset de contraseña con token" } },
    "/account/orders": { get: { summary: "Pedidos del usuario" } },
    "/account/addresses": {
      get: { summary: "Direcciones del usuario" },
      post: { summary: "Crear dirección" },
      delete: { summary: "Eliminar dirección" }
    },
    "/account/wishlist": {
      get: { summary: "Favoritos" },
      post: { summary: "Añadir a favoritos" },
      delete: { summary: "Eliminar favorito" }
    },
    "/account/profile": {
      patch: { summary: "Actualizar perfil" },
      post: { summary: "Cambiar contraseña" }
    },
    "/orders/{number}": { get: { summary: "Detalle de pedido (propietario o admin)" } },
    "/reviews": { post: { summary: "Crear review (compra verificada)" } },
    "/newsletter": { post: { summary: "Suscripción al newsletter" } },
    "/admin/stats": { get: { summary: "KPIs del panel admin" } },
    "/admin/products": { get: { summary: "Listar (admin)" }, post: { summary: "Crear (admin)" } },
    "/admin/products/{id}": {
      get: { summary: "Detalle (admin)" },
      patch: { summary: "Actualizar (admin)" },
      delete: { summary: "Borrar (admin)" }
    },
    "/admin/orders": { get: { summary: "Listar pedidos (admin)" } },
    "/admin/orders/{id}": { patch: { summary: "Cambiar estado / tracking" } },
    "/admin/customers": { get: { summary: "Listar clientes (admin)" } },
    "/admin/coupons": { get: { summary: "Listar cupones" }, post: { summary: "Crear cupón" } }
  }
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("format") === "json") {
    return new Response(JSON.stringify(spec, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>SMURFX API · Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"/>
  </head><body><div id="ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => SwaggerUIBundle({ spec: ${JSON.stringify(spec)}, dom_id: "#ui" });
  </script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
