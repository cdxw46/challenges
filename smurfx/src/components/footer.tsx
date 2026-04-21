import Link from "next/link";
import { Logo } from "./logo";
import { Shield, Truck } from "./icons";

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Productos",
    links: [
      { label: "Hombre", href: "/hombre" },
      { label: "Mujer", href: "/mujer" },
      { label: "Niños", href: "/ninos" },
      { label: "Sale", href: "/sale" },
      { label: "Colecciones", href: "/coleccion/blue-revolution" }
    ]
  },
  {
    title: "Ayuda",
    links: [
      { label: "Centro de ayuda", href: "/ayuda" },
      { label: "Envíos y devoluciones", href: "/envios-devoluciones" },
      { label: "Guía de tallas", href: "/guia-de-tallas" },
      { label: "Estado del pedido", href: "/cuenta" }
    ]
  },
  {
    title: "SMURFX",
    links: [
      { label: "Sobre nosotros", href: "/sobre-nosotros" },
      { label: "Sostenibilidad", href: "/sostenibilidad" },
      { label: "Empleo", href: "/empleo" },
      { label: "Blog", href: "/blog" },
      { label: "SmurfX Members", href: "/members" }
    ]
  },
  {
    title: "Legal",
    links: [
      { label: "Términos", href: "/terminos" },
      { label: "Privacidad", href: "/privacidad" },
      { label: "Cookies", href: "/privacidad#cookies" },
      { label: "Mapa del sitio", href: "/sitemap" }
    ]
  }
];

export function Footer() {
  return (
    <footer className="mt-32 border-t border-ink/10 bg-ink text-white">
      <div className="container-x py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Logo dark />
            <p className="mt-4 max-w-sm text-sm text-white/70">
              SMURFX. Diseño atlético, ingeniería premium, propósito claro. Move in blue.
            </p>
            <form
              action="/api/newsletter"
              method="post"
              className="mt-6 flex max-w-sm overflow-hidden rounded-full border border-white/20"
            >
              <input
                name="email"
                type="email"
                required
                placeholder="Tu email"
                className="flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-white/50"
              />
              <button className="bg-white px-5 text-xs font-bold uppercase tracking-wider text-ink">
                Suscribirme
              </button>
            </form>
            <div className="mt-6 flex gap-4 text-xs uppercase tracking-wider text-white/60">
              <a href="#" aria-label="Instagram">Instagram</a>
              <a href="#" aria-label="TikTok">TikTok</a>
              <a href="#" aria-label="YouTube">YouTube</a>
              <a href="#" aria-label="X">X</a>
            </div>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <div className="mb-4 text-xs font-bold uppercase tracking-widest text-white/60">{c.title}</div>
              <ul className="space-y-2 text-sm">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-white/85 hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-6 border-t border-white/10 pt-8 text-xs text-white/60 md:grid-cols-3">
          <div className="flex items-center gap-2">
            <Truck size={18} />
            Envío gratis a partir de 50€ · Devoluciones gratis 30 días
          </div>
          <div className="flex items-center gap-2">
            <Shield size={18} />
            Pago 100% seguro · PCI DSS · SSL
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {["VISA", "MasterCard", "AMEX", "PayPal", "Apple Pay", "Google Pay", "Klarna", "Bizum"].map((p) => (
              <span
                key={p}
                className="rounded-md border border-white/15 px-2 py-1 text-[10px] uppercase tracking-wider"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-6 text-center text-xs text-white/50">
          © {new Date().getFullYear()} SMURFX · Move in blue · Hecho con propósito.
        </div>
      </div>
    </footer>
  );
}
