import { handle, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || undefined;
  const items = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } }
          ]
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      membersPoints: true,
      membersLevel: true,
      createdAt: true,
      _count: { select: { orders: true } }
    }
  });
  return json({ items });
});
