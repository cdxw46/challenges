import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [pages, posts, collections] = await Promise.all([
    prisma.page.findMany({ orderBy: { slug: "asc" } }),
    prisma.blogPost.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.collection.findMany({ orderBy: { name: "asc" } })
  ]);
  return (
    <div className="p-8">
      <h1 className="h-display text-3xl">Contenido</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-ink/10 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Páginas</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {pages.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-md bg-ink/5 px-3 py-2">
                <Link href={`/${p.slug}`} className="font-bold hover:text-smurf-600">{p.title}</Link>
                <span className="text-xs text-ink/55">/{p.slug}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-ink/10 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Blog</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {posts.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-md bg-ink/5 px-3 py-2">
                <Link href={`/blog/${p.slug}`} className="font-bold hover:text-smurf-600">{p.title}</Link>
                <span className="text-xs text-ink/55">{p.publishedAt ? "publicado" : "borrador"}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-ink/10 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Colecciones</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {collections.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md bg-ink/5 px-3 py-2">
                <Link href={`/coleccion/${c.slug}`} className="font-bold hover:text-smurf-600">{c.name}</Link>
                <span className="text-xs text-ink/55">/coleccion/{c.slug}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
