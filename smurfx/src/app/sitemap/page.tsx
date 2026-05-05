import Link from "next/link";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export const metadata = { title: "Mapa del sitio" };

export default async function Page() {
  const cats = await prisma.category.findMany();
  const cols = await prisma.collection.findMany();
  return (
    <div className="container-x py-12">
      <h1 className="h-display text-4xl">Mapa del sitio</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-3">
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink/60">Tienda</h2>
          <ul className="space-y-1 text-sm">
            <li><Link href="/hombre">Hombre</Link></li>
            <li><Link href="/mujer">Mujer</Link></li>
            <li><Link href="/ninos">Niños</Link></li>
            <li><Link href="/sale">Sale</Link></li>
            {cats.map((c) => (
              <li key={c.id}><Link href={`/${c.slug}`}>{c.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink/60">Colecciones</h2>
          <ul className="space-y-1 text-sm">
            {cols.map((c) => (
              <li key={c.id}><Link href={`/coleccion/${c.slug}`}>{c.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink/60">Información</h2>
          <ul className="space-y-1 text-sm">
            {[
              ["Sobre nosotros", "/sobre-nosotros"],
              ["Sostenibilidad", "/sostenibilidad"],
              ["Empleo", "/empleo"],
              ["Blog", "/blog"],
              ["Ayuda", "/ayuda"],
              ["Envíos y devoluciones", "/envios-devoluciones"],
              ["Términos", "/terminos"],
              ["Privacidad", "/privacidad"],
              ["Guía de tallas", "/guia-de-tallas"],
              ["SmurfX Members", "/members"]
            ].map(([l, h]) => (
              <li key={h}><Link href={h}>{l}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
