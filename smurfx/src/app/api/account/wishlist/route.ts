import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await getCurrentUser();
  if (!user) return error(401, "No autenticado");
  const items = await prisma.wishlistItem.findMany({
    where: { userId: user.id },
    include: { product: { include: { images: { take: 1, orderBy: { position: "asc" } } } } }
  });
  return json({ items });
});

export const POST = handle(async (req) => {
  const user = await getCurrentUser();
  if (!user) return error(401, "No autenticado");
  const { productId } = await req.json();
  await prisma.wishlistItem.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    create: { userId: user.id, productId },
    update: {}
  });
  return json({ ok: true });
});

export const DELETE = handle(async (req) => {
  const user = await getCurrentUser();
  if (!user) return error(401, "No autenticado");
  const productId = new URL(req.url).searchParams.get("productId");
  if (!productId) return error(400, "productId requerido");
  await prisma.wishlistItem.deleteMany({ where: { userId: user.id, productId } });
  return json({ ok: true });
});
