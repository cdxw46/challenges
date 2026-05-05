import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  productId: z.string(),
  rating: z.number().min(1).max(5),
  title: z.string().optional(),
  body: z.string().min(10)
});

export const POST = handle(async (req) => {
  const user = await getCurrentUser();
  if (!user) return error(401, "Necesitas iniciar sesión para opinar");
  const data = schema.parse(await req.json());
  const purchase = await prisma.orderItem.findFirst({
    where: {
      order: { userId: user.id, status: { in: ["paid", "shipped", "delivered"] } },
      variant: { productId: data.productId }
    }
  });
  if (!purchase) {
    return error(403, "Solo clientes con compra verificada pueden valorar este producto");
  }
  const review = await prisma.review.create({
    data: {
      productId: data.productId,
      userId: user.id,
      rating: data.rating,
      title: data.title,
      body: data.body,
      verified: true
    }
  });
  const stats = await prisma.review.aggregate({
    where: { productId: data.productId },
    _avg: { rating: true },
    _count: true
  });
  await prisma.product.update({
    where: { id: data.productId },
    data: { rating: stats._avg.rating ?? 0, ratingCount: stats._count }
  });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      membersPoints: { increment: 50 },
      pointsTx: { create: { points: 50, reason: "review", reference: review.id } }
    }
  });
  return json({ ok: true, review });
});
