import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const slug = new URL(req.url).pathname.split("/").pop()!;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: [{ color: "asc" }, { size: "asc" }] },
      categories: true,
      collections: true,
      reviews: {
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 20
      }
    }
  });
  if (!product) return error(404, "Producto no encontrado");
  const colors = Array.from(
    new Map(product.variants.map((v) => [v.color, v.colorHex])).entries()
  ).map(([color, colorHex]) => ({ color, colorHex }));
  return json({ ...product, colors });
});
