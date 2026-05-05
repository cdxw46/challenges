import { handle, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const gender = url.searchParams.get("gender");
  const activity = url.searchParams.get("activity");
  const line = url.searchParams.get("line");
  const collection = url.searchParams.get("collection");
  const onSale = url.searchParams.get("sale") === "1";
  const isNew = url.searchParams.get("new") === "1";
  const minPrice = Number(url.searchParams.get("min") || 0);
  const maxPrice = Number(url.searchParams.get("max") || 0);
  const sizes = url.searchParams.getAll("size");
  const colors = url.searchParams.getAll("color");
  const sort = url.searchParams.get("sort") || "relevance";
  const limit = Math.min(48, Number(url.searchParams.get("limit") || 24));
  const cursor = url.searchParams.get("cursor") || undefined;

  const where: Prisma.ProductWhereInput = { status: "published" };
  if (gender && gender !== "all") where.gender = gender;
  if (activity) where.activity = activity;
  if (line) where.line = line;
  if (isNew) where.isNew = true;
  if (onSale) where.salePrice = { not: null };
  if (minPrice) (where as any).basePrice = { gte: minPrice };
  if (maxPrice) where.basePrice = { ...(where.basePrice as object), lte: maxPrice } as any;
  if (collection) where.collections = { some: { slug: collection } };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { shortDesc: { contains: q } },
      { description: { contains: q } },
      { line: { contains: q } }
    ];
  }
  if (sizes.length || colors.length) {
    where.variants = {
      some: {
        ...(sizes.length ? { size: { in: sizes } } : {}),
        ...(colors.length ? { color: { in: colors } } : {})
      }
    };
  }

  let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: "desc" };
  if (sort === "price_asc") orderBy = { basePrice: "asc" };
  else if (sort === "price_desc") orderBy = { basePrice: "desc" };
  else if (sort === "rating") orderBy = { rating: "desc" };
  else if (sort === "new") orderBy = { createdAt: "desc" };

  const items = await prisma.product.findMany({
    where,
    orderBy,
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    include: {
      images: { orderBy: { position: "asc" } },
      variants: true
    }
  });
  const hasMore = items.length > limit;
  const slice = items.slice(0, limit);
  const next = hasMore ? slice[slice.length - 1].id : null;

  return json({
    items: slice.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      line: p.line,
      gender: p.gender,
      activity: p.activity,
      basePrice: p.basePrice,
      salePrice: p.salePrice,
      isNew: p.isNew,
      images: p.images.map((i) => ({ url: i.url, alt: i.alt, color: i.color })),
      colors: Array.from(new Set(p.variants.map((v) => v.color))),
      colorHexes: Array.from(
        new Map(p.variants.map((v) => [v.color, v.colorHex])).entries()
      ).map(([color, colorHex]) => ({ color, colorHex })),
      sizes: Array.from(new Set(p.variants.map((v) => v.size))),
      stock: p.variants.reduce((a, v) => a + v.stock, 0)
    })),
    next
  });
});
