"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-[1.2fr_1fr_1fr_1fr] md:px-6 lg:px-8">
        <div className="space-y-4">
          <div>
            <span className="text-2xl font-black tracking-[0.3em] text-white">
              SMURF<span className="text-[var(--brand-primary)]">X</span>
            </span>
            <p className="mt-3 max-w-sm text-sm text-white/68">
              Tienda online premium de zapatillas y ropa deportiva. Rendimiento, minimalismo y precision visual.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/70">
            <span>Instagram</span>
            <span>LinkedIn</span>
            <span>TikTok</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4 text-[var(--brand-lavender)]" />
            SSL, pagos seguros y checkout protegido.
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/90">Comprar</h3>
          <ul className="mt-4 space-y-3 text-sm text-white/70">
            <li><Link href="/hombre">Hombre</Link></li>
            <li><Link href="/mujer">Mujer</Link></li>
            <li><Link href="/ninos">Ninos</Link></li>
            <li><Link href="/sale">Sale</Link></li>
            <li><Link href="/coleccion/new-arrivals">Colecciones</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/90">Soporte</h3>
          <ul className="mt-4 space-y-3 text-sm text-white/70">
            <li><Link href="/ayuda">Ayuda</Link></li>
            <li><Link href="/envios-devoluciones">Envios y devoluciones</Link></li>
            <li><Link href="/guia-de-tallas">Guia de tallas</Link></li>
            <li><Link href="/privacidad">Privacidad</Link></li>
            <li><Link href="/terminos">Terminos</Link></li>
          </ul>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/90">Newsletter</h3>
          <p className="text-sm text-white/70">Acceso anticipado, lanzamientos y beneficios SmurfX Members.</p>
          <form className="space-y-3">
            <input
              className="w-full rounded-full border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
              type="email"
              placeholder="Tu email"
            />
            <button
              className="w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-[var(--brand-lavender)]"
              type="button"
            >
              Unirme
            </button>
          </form>
          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/52">
            <span>Visa</span>
            <span>Mastercard</span>
            <span>PayPal</span>
            <span>Klarna</span>
            <span>Bizum</span>
            <span>Apple Pay</span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-white/45 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} SMURFX. Move in blue.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/sitemap">Sitemap</Link>
            <Link href="/sobre-nosotros">Sobre SmurfX</Link>
            <Link href="/sostenibilidad">Sostenibilidad</Link>
            <Link href="/members">SmurfX Members</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
