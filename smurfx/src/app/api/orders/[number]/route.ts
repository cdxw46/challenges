import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const number = new URL(req.url).pathname.split("/").pop()!;
  const order = await prisma.order.findUnique({
    where: { number },
    include: {
      items: true,
      history: { orderBy: { createdAt: "asc" } },
      payments: true
    }
  });
  if (!order) return error(404, "Pedido no encontrado");
  const user = await getCurrentUser();
  const isOwner = user?.id === order.userId;
  const isAdmin = user && ["admin", "superadmin", "order_manager"].includes(user.role);
  if (!isOwner && !isAdmin) return error(403, "No autorizado");
  return json({
    ...order,
    shippingAddress: JSON.parse(order.shippingAddress)
  });
});
