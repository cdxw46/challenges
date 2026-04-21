import Link from "next/link";

const routes = [
  "/",
  "/hombre",
  "/mujer",
  "/ninos",
  "/sale",
  "/members",
  "/buscar?q=SmurfAir",
  "/producto/smurfair-max-one-azul",
  "/coleccion/new-arrivals",
  "/blog",
  "/carrito",
  "/checkout",
  "/cuenta",
  "/sobre-nosotros",
  "/sostenibilidad",
  "/envios-devoluciones",
  "/terminos",
  "/privacidad",
  "/ayuda",
  "/guia-de-tallas",
  "/empleo",
  "/admin",
  "/api/docs",
];

export default function SitemapPage() {
  return (
    <div className="page-shell page-stack">
      <section className="listing-hero">
        <div>
          <span className="section-eyebrow">Sitemap</span>
          <h1>Navegacion principal de SMURFX.</h1>
          <p>Acceso directo a las rutas clave del storefront, cuenta, admin y documentacion.</p>
        </div>
      </section>

      <section className="card static-page-card">
        <div className="static-page-body">
          <div className="link-list">
            {routes.map((route) => (
              <Link key={route} href={route}>
                {route}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
