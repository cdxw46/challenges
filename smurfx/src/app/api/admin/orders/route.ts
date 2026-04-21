import { handle, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const items = await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { items: true, user: { select: { firstName: true, lastName: true, email: true } } },
    take: 200
  });
  return json({ items });
});
