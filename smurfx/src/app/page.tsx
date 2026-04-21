import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/product-card";
import { Section } from "@/components/section";
import { HorizontalScroller } from "@/components/horizontal-scroller";
import { BRAND } from "@/lib/brand";
import { Sparkle } from "@/components/icons";

export const revalidate = 60;

async function getData() {
  const [latest, top, collections] = await Promise.all([
    prisma.product.findMany({
      where: { status: "published", isNew: true },
      take: 12,
      orderBy: { createdAt: "desc" },
      include: { images: { orderBy: { position: "asc" } }, variants: true }
    }),
    prisma.product.findMany({
      where: { status: "published" },
      take: 8,
      orderBy: { rating: "desc" },
      include: { images: { orderBy: { position: "asc" } }, variants: true }
    }),
    prisma.collection.findMany({ take: 3, orderBy: { position: "asc" } })
  ]);
  return { latest, top, collections };
}

export default async function HomePage() {
  const { latest, top, collections } = await getData();

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="relative isolate flex min-h-[80vh] items-end bg-cover bg-center text-white"
          style={{ backgroundImage: "url(/api/img/hero)" }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <div className="container-x relative z-10 pb-16 pt-24">
            <div className="max-w-2xl animate-fade-up">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-smurf-100">
                Blue Revolution · SS25
              </div>
              <h1 className="h-display text-5xl md:text-7xl lg:text-[5.5rem]">
                Move in <span className="text-smurf-100">blue</span>.
              </h1>
              <p className="mt-6 max-w-lg text-lg text-white/85">
                Una nueva era de zapatillas y ropa deportiva. Diseñadas para llevarte donde quieras ir.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/coleccion/blue-revolution" className="btn-primary">
                  Comprar la colección
                </Link>
                <Link
                  href="/hombre"
                  className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/0 px-6 py-3 font-semibold uppercase tracking-wide text-white hover:bg-white hover:text-ink"
                >
                  Explorar todo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NUEVOS LANZAMIENTOS */}
      <Section title="Nuevos lanzamientos" eyebrow="Recién llegado" cta={{ label: "Ver todos", href: "/hombre?sort=new" }}>
        <HorizontalScroller>
          {latest.map((p) => (
            <div key={p.id} className="w-72 shrink-0 snap-start">
              <ProductCard
                slug={p.slug}
                name={p.name}
                line={p.line}
                basePrice={p.basePrice}
                salePrice={p.salePrice}
                isNew={p.isNew}
                images={p.images.map((i) => ({ url: i.url, alt: i.alt, color: i.color }))}
                colorHexes={Array.from(
                  new Map(p.variants.map((v) => [v.color, v.colorHex])).entries()
                ).map(([color, colorHex]) => ({ color, colorHex }))}
              />
            </div>
          ))}
        </HorizontalScroller>
      </Section>

      {/* CATEGORÍAS DE ACTIVIDAD */}
      <Section title="Tu deporte. Tu estilo.">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {BRAND.activities.map((a, i) => (
            <Link
              key={a}
              href={`/hombre?activity=${a}`}
              className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-smurf-50"
            >
              <div
                className="absolute inset-0 transition duration-700 group-hover:scale-110"
                style={{
                  background: [
                    "linear-gradient(135deg,#534AB7,#1f1c5c)",
                    "linear-gradient(135deg,#0a0a0a,#534AB7)",
                    "linear-gradient(135deg,#cecbf6,#534AB7)",
                    "linear-gradient(135deg,#3f3897,#0a0a0a)",
                    "linear-gradient(135deg,#1E3A8A,#534AB7)"
                  ][i % 5]
                }}
              />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/70">Actividad</div>
                <div className="mt-1 text-2xl font-extrabold capitalize">{a}</div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* BANNER EDITORIAL */}
      <Section className="!py-0">
        <div className="grid overflow-hidden rounded-3xl md:grid-cols-2">
          <div
            className="relative min-h-[420px] bg-cover bg-center p-10 text-white"
            style={{
              background:
                "linear-gradient(135deg,#1f1c5c, #534AB7), url(/api/img/hero)",
              backgroundBlendMode: "multiply"
            }}
          >
            <div className="text-xs font-bold uppercase tracking-widest text-smurf-100">SmurfGlide Pro</div>
            <h3 className="mt-3 h-display text-4xl md:text-5xl">Deslízate. Sin fricción.</h3>
            <p className="mt-3 max-w-md text-white/85">
              Espuma SuperFoam con placa SmurfPlate. Para tus mejores tiempos.
            </p>
            <Link href="/hombre?line=SmurfGlide" className="mt-6 inline-flex btn-primary bg-white !text-smurf-700 hover:bg-smurf-100">
              Comprar
            </Link>
          </div>
          <div className="relative min-h-[420px] bg-smurf-50 p-10">
            <div className="text-xs font-bold uppercase tracking-widest text-smurf-500">SmurfTrail Peak</div>
            <h3 className="mt-3 h-display text-4xl md:text-5xl text-ink">Conquista cualquier sendero.</h3>
            <p className="mt-3 max-w-md text-ink/70">
              GripX, protección frente a rocas y construcción impermeable. Hecha para la montaña.
            </p>
            <Link href="/hombre?line=SmurfTrail" className="btn-secondary mt-6 inline-flex">
              Comprar
            </Link>
          </div>
        </div>
      </Section>

      {/* MÁS VENDIDOS */}
      <Section title="Lo más vendido" eyebrow="Top SMURFX" cta={{ label: "Ver todos", href: "/hombre?sort=top" }}>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {top.map((p) => (
            <ProductCard
              key={p.id}
              slug={p.slug}
              name={p.name}
              line={p.line}
              basePrice={p.basePrice}
              salePrice={p.salePrice}
              isNew={p.isNew}
              images={p.images.map((i) => ({ url: i.url, alt: i.alt, color: i.color }))}
              colorHexes={Array.from(
                new Map(p.variants.map((v) => [v.color, v.colorHex])).entries()
              ).map(([color, colorHex]) => ({ color, colorHex }))}
            />
          ))}
        </div>
      </Section>

      {/* SMURFX MEMBERS */}
      <section className="relative overflow-hidden bg-ink py-20 text-white">
        <div className="container-x grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-smurf-200">SmurfX Members</div>
            <h2 className="h-display text-4xl md:text-5xl">El programa que te mueve.</h2>
            <p className="mt-4 max-w-lg text-white/75">
              Únete gratis y desbloquea acceso anticipado, eventos, recompensas y envíos exclusivos. Sube de nivel con
              cada compra.
            </p>
            <div className="mt-8 flex gap-3">
              <Link href="/cuenta/registro" className="btn-primary">
                Hazte Member
              </Link>
              <Link
                href="/members"
                className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 font-semibold uppercase tracking-wide text-white"
              >
                Cómo funciona
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {BRAND.members.levels.map((lvl) => (
              <div
                key={lvl.key}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <Sparkle />
                <div className="mt-3 text-xl font-extrabold uppercase tracking-wider">{lvl.label}</div>
                <div className="mt-1 text-xs text-white/60">{lvl.min}+ pts</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COLECCIONES DESTACADAS */}
      <Section title="Colecciones destacadas">
        <div className="grid gap-5 md:grid-cols-3">
          {collections.map((c, i) => (
            <Link
              key={c.id}
              href={`/coleccion/${c.slug}`}
              className="group relative aspect-[4/5] overflow-hidden rounded-3xl"
            >
              <div
                className="absolute inset-0 transition duration-700 group-hover:scale-110"
                style={{
                  background: ["linear-gradient(160deg,#534AB7,#0a0a0a)", "linear-gradient(160deg,#cecbf6,#534AB7)", "linear-gradient(160deg,#0a0a0a,#534AB7)"][i % 3]
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/75">Colección</div>
                <div className="mt-1 text-2xl font-extrabold">{c.name}</div>
                <p className="mt-1 line-clamp-2 text-sm text-white/80">{c.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* REVIEWS */}
      <Section title="Lo que dicen quienes ya se mueven" eyebrow="Reviews">
        <HorizontalScroller>
          {[
            { name: "Lucía", text: "Las SmurfRun son una pasada para entrenar a diario. Comodísimas." },
            { name: "Marcos", text: "El cortavientos PeakShell pesa nada y aguanta el viento real." },
            { name: "Aitana", text: "Las SmurfForce tienen un acabado premium impresionante." },
            { name: "Hugo", text: "El envío llegó en 2 días y la web es súper rápida." }
          ].map((r, i) => (
            <div key={i} className="w-80 shrink-0 snap-start rounded-2xl border border-ink/10 bg-white p-6">
              <div className="text-amber-500">★★★★★</div>
              <p className="mt-3 text-sm">{r.text}</p>
              <div className="mt-3 text-xs font-bold uppercase tracking-wider text-ink/60">{r.name} · Cliente verificado</div>
            </div>
          ))}
        </HorizontalScroller>
      </Section>
    </>
  );
}
