import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await getCurrentUser();
  if (!user) return error(401, "No autenticado");
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { items: true }
  });
  return json({ orders });
});
