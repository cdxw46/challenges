import { handle, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { effectivePrice } from "@/lib/format";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return json({ products: [], categories: [], popular: [] });
  const products = await prisma.product.findMany({
    where: {
      status: "published",
      OR: [
        { name: { contains: q } },
        { line: { contains: q } },
        { shortDesc: { contains: q } },
        { description: { contains: q } }
      ]
    },
    include: { images: { take: 1, orderBy: { position: "asc" } } },
    take: 8,
    orderBy: { createdAt: "desc" }
  });
  const categories = await prisma.category.findMany({
    where: { name: { contains: q } },
    take: 6
  });
  return json({
    products: products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      image: p.images[0]?.url ?? null,
      price: effectivePrice(p.basePrice, p.salePrice)
    })),
    categories: categories.map((c) => ({ name: c.name, slug: c.slug })),
    popular: ["smurfair", "running", "trail", "smurfforce", "sale"]
  });
});
