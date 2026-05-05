import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatPrice, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status;
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="h-display text-3xl">Pedidos</h1>
        <div className="flex gap-2 text-xs">
          {["", "pending", "paid", "shipped", "delivered", "cancelled", "refunded"].map((s) => (
            <Link
              key={s}
              href={`/admin/pedidos${s ? `?status=${s}` : ""}`}
              className={`rounded-full border px-3 py-1 ${status === s || (!status && !s) ? "border-smurf-500 bg-smurf-50 text-smurf-700" : "border-ink/10"}`}
            >
              {s || "Todos"}
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-xs uppercase tracking-wider text-ink/60">
            <tr>
              <th className="px-4 py-3 text-left">Pedido</th>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Total</th>
              <th className="px-4 py-3 text-left">Pago</th>
              <th className="px-4 py-3 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-ink/5">
                <td className="px-4 py-3"><Link href={`/admin/pedidos/${o.id}`} className="font-bold hover:text-smurf-600">{o.number}</Link></td>
                <td className="px-4 py-3">{o.email}</td>
                <td className="px-4 py-3 text-xs text-ink/60">{formatDateTime(o.createdAt)}</td>
                <td className="px-4 py-3 font-semibold">{formatPrice(o.total)}</td>
                <td className="px-4 py-3 capitalize">{o.paymentProvider}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-smurf-50 px-2 py-0.5 text-xs font-bold uppercase text-smurf-700">{o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
