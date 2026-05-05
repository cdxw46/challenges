import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const products = await prisma.product.findMany({
    where: { status: "published" },
    select: { slug: true, updatedAt: true }
  });
  const categories = await prisma.category.findMany();
  const collections = await prisma.collection.findMany();
  const posts = await prisma.blogPost.findMany({ where: { publishedAt: { not: null } } });

  const urls: { loc: string; lastmod?: string }[] = [
    { loc: "/" },
    { loc: "/hombre" },
    { loc: "/mujer" },
    { loc: "/ninos" },
    { loc: "/sale" },
    { loc: "/blog" },
    { loc: "/sobre-nosotros" },
    { loc: "/sostenibilidad" },
    { loc: "/empleo" },
    { loc: "/ayuda" },
    { loc: "/terminos" },
    { loc: "/privacidad" }
  ];
  for (const p of products)
    urls.push({ loc: `/producto/${p.slug}`, lastmod: p.updatedAt.toISOString() });
  for (const c of categories) urls.push({ loc: `/${c.slug}` });
  for (const c of collections) urls.push({ loc: `/coleccion/${c.slug}` });
  for (const p of posts) urls.push({ loc: `/blog/${p.slug}` });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (u) =>
        `<url><loc>${base}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`
    )
    .join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
