import { prisma } from "@/lib/prisma";
import { formatPrice, formatDateTime } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page() {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - 7);
  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

  const [today, week, month, totalOrders, totalUsers, lowStock, recentOrders, salesByDay] = await Promise.all([
    prisma.order.aggregate({
      _sum: { total: true }, _count: true,
      where: { createdAt: { gte: startOfDay }, status: { in: ["paid", "shipped", "delivered"] } }
    }),
    prisma.order.aggregate({
      _sum: { total: true }, _count: true,
      where: { createdAt: { gte: startOfWeek }, status: { in: ["paid", "shipped", "delivered"] } }
    }),
    prisma.order.aggregate({
      _sum: { total: true }, _count: true,
      where: { createdAt: { gte: startOfMonth }, status: { in: ["paid", "shipped", "delivered"] } }
    }),
    prisma.order.count(),
    prisma.user.count(),
    prisma.productVariant.findMany({ where: { stock: { lt: 5 } }, take: 6, include: { product: { select: { name: true, slug: true } } } }),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { items: true } }),
    prisma.order.groupBy({
      by: ["createdAt"],
      _sum: { total: true },
      where: { createdAt: { gte: startOfWeek } }
    }).catch(() => [])
  ]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const total = (salesByDay as any[]).filter((g) => g.createdAt >= d && g.createdAt < next)
      .reduce((a: number, g: any) => a + (g._sum.total || 0), 0);
    return { date: d, total };
  });
  const max = Math.max(1, ...days.map((d) => d.total));

  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-2xl border border-ink/10 p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-ink/60">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink/55">{sub}</div>}
    </div>
  );

  return (
    <div className="p-8">
      <h1 className="h-display text-3xl">Dashboard</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stat("Hoy", formatPrice(today._sum.total || 0), `${today._count} pedidos`)}
        {stat("7 días", formatPrice(week._sum.total || 0), `${week._count} pedidos`)}
        {stat("Mes", formatPrice(month._sum.total || 0), `${month._count} pedidos`)}
        {stat("Pedidos totales", String(totalOrders))}
        {stat("Usuarios", String(totalUsers))}
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Ventas últimos 7 días</h2>
          <div className="mt-6 flex h-44 items-end gap-2">
            {days.map((d) => (
              <div key={d.date.toISOString()} className="flex-1 text-center">
                <div className="mx-auto w-8 rounded-md bg-smurf-500" style={{ height: `${(d.total / max) * 100}%` }} />
                <div className="mt-1 text-[10px] text-ink/55">
                  {d.date.toLocaleDateString("es-ES", { weekday: "short" })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-ink/10 p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Stock bajo</h2>
          <ul className="mt-3 divide-y divide-ink/10 text-sm">
            {lowStock.length === 0 && <li className="py-3 text-ink/55">Todo el stock en orden.</li>}
            {lowStock.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-3">
                <Link href={`/producto/${v.product.slug}`} className="font-semibold hover:text-smurf-600">
                  {v.product.name}
                </Link>
                <span className="text-xs text-ink/55">
                  {v.color} · {v.size}
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                  {v.stock} u.
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-ink/10 p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Pedidos recientes</h2>
        <ul className="mt-3 divide-y divide-ink/10 text-sm">
          {recentOrders.map((o) => (
            <li key={o.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-3">
              <div>
                <Link href={`/admin/pedidos/${o.id}`} className="font-bold hover:text-smurf-600">{o.number}</Link>
                <div className="text-xs text-ink/55">{o.email}</div>
              </div>
              <span className="rounded-full bg-smurf-50 px-2 py-0.5 text-xs font-bold uppercase text-smurf-700">{o.status}</span>
              <span className="font-bold">{formatPrice(o.total)}</span>
              <span className="text-xs text-ink/55">{formatDateTime(o.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
