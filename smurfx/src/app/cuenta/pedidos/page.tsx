import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPrice, formatDate } from "@/lib/format";
import { Sidebar } from "@/components/account/dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/cuenta/login?next=/cuenta/pedidos");
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { items: true }
  });
  return (
    <div className="container-x grid gap-8 py-10 md:grid-cols-[260px_1fr]">
      <Sidebar />
      <div>
        <h1 className="h-display text-3xl">Mis pedidos</h1>
        {orders.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">Aún no has realizado pedidos.</p>
        ) : (
          <ul className="mt-6 divide-y divide-ink/10 rounded-2xl border border-ink/10">
            {orders.map((o) => (
              <li key={o.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-4">
                <div>
                  <div className="font-bold">{o.number}</div>
                  <div className="text-xs text-ink/60">
                    {formatDate(o.createdAt)} · {o.items.length} productos
                  </div>
                </div>
                <span className="rounded-full bg-smurf-50 px-2 py-0.5 text-xs font-bold uppercase text-smurf-700">
                  {o.status}
                </span>
                <span className="font-bold">{formatPrice(o.total)}</span>
                <Link href={`/cuenta/pedidos/${o.number}`} className="text-xs font-semibold text-smurf-600">
                  Ver detalle →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
