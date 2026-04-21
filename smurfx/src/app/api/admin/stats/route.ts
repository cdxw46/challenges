import { handle, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireAdmin();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - 7);
  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

  const [today, week, month, totalOrders, totalUsers, lowStock, recentOrders] = await Promise.all([
    prisma.order.aggregate({
      _sum: { total: true },
      _count: true,
      where: { createdAt: { gte: startOfDay }, status: { in: ["paid", "shipped", "delivered"] } }
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      _count: true,
      where: { createdAt: { gte: startOfWeek }, status: { in: ["paid", "shipped", "delivered"] } }
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      _count: true,
      where: { createdAt: { gte: startOfMonth }, status: { in: ["paid", "shipped", "delivered"] } }
    }),
    prisma.order.count(),
    prisma.user.count(),
    prisma.productVariant.findMany({
      where: { stock: { lt: 5 } },
      include: { product: { select: { name: true, slug: true } } },
      take: 8
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { items: { take: 1 } }
    })
  ]);

  return json({
    today: { revenue: today._sum.total ?? 0, count: today._count },
    week: { revenue: week._sum.total ?? 0, count: week._count },
    month: { revenue: month._sum.total ?? 0, count: month._count },
    totalOrders,
    totalUsers,
    lowStock,
    recentOrders
  });
});
