import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductDetail } from "@/components/product-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const p = await prisma.product.findUnique({ where: { slug: params.slug } });
  if (!p) return {};
  return {
    title: p.seoTitle || p.name,
    description: p.seoDesc || p.shortDesc,
    openGraph: {
      title: p.name,
      description: p.shortDesc,
      images: p.ogImage ? [p.ogImage] : undefined
    }
  };
}

export default async function Page({ params }: { params: { slug: string } }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: [{ color: "asc" }, { size: "asc" }] },
      reviews: {
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 30
      }
    }
  });
  if (!product || product.status !== "published") notFound();

  const colors = Array.from(
    new Map(product.variants.map((v) => [v.color, v.colorHex])).entries()
  ).map(([color, colorHex]) => ({ color, colorHex }));

  const related = await prisma.product.findMany({
    where: { line: product.line, id: { not: product.id }, status: "published" },
    take: 4,
    include: { images: { take: 2, orderBy: { position: "asc" } }, variants: true }
  });

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.map((i) => i.url),
    sku: product.id,
    brand: { "@type": "Brand", name: "SMURFX" },
    offers: {
      "@type": "Offer",
      priceCurrency: "EUR",
      price: product.salePrice ?? product.basePrice,
      availability: product.variants.some((v) => v.stock > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock"
    },
    aggregateRating:
      product.ratingCount > 0
        ? { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.ratingCount }
        : undefined
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetail
        product={{
          id: product.id,
          slug: product.slug,
          name: product.name,
          line: product.line,
          shortDesc: product.shortDesc,
          description: product.description,
          basePrice: product.basePrice,
          salePrice: product.salePrice ?? null,
          isNew: product.isNew,
          rating: product.rating,
          ratingCount: product.ratingCount,
          images: product.images.map((i) => ({
            url: i.url,
            alt: i.alt,
            color: i.color
          })),
          variants: product.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            size: v.size,
            color: v.color,
            colorHex: v.colorHex,
            stock: v.stock
          })),
          colors,
          reviews: product.reviews.map((r) => ({
            id: r.id,
            rating: r.rating,
            title: r.title,
            body: r.body,
            createdAt: r.createdAt.toISOString(),
            authorName: r.user ? `${r.user.firstName}` : "Anónimo",
            verified: r.verified
          }))
        }}
        related={related.map((p) => ({
          slug: p.slug,
          name: p.name,
          line: p.line,
          basePrice: p.basePrice,
          salePrice: p.salePrice,
          isNew: p.isNew,
          images: p.images.map((i) => ({ url: i.url, alt: i.alt, color: i.color })),
          colorHexes: Array.from(
            new Map(p.variants.map((v) => [v.color, v.colorHex])).entries()
          ).map(([color, colorHex]) => ({ color, colorHex }))
        }))}
      />
    </>
  );
}
