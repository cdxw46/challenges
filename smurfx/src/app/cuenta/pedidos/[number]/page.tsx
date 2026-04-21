import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPrice, formatDateTime } from "@/lib/format";
import { Sidebar } from "@/components/account/dashboard";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { number: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/cuenta/login?next=/cuenta/pedidos/${params.number}`);
  const order = await prisma.order.findUnique({
    where: { number: params.number },
    include: { items: true, history: { orderBy: { createdAt: "asc" } } }
  });
  if (!order || (order.userId && order.userId !== user.id)) notFound();
  const addr = JSON.parse(order.shippingAddress);
  return (
    <div className="container-x grid gap-8 py-10 md:grid-cols-[260px_1fr]">
      <Sidebar />
      <div>
        <div className="flex items-center justify-between">
          <h1 className="h-display text-3xl">Pedido {order.number}</h1>
          <span className="rounded-full bg-smurf-50 px-3 py-1 text-xs font-bold uppercase text-smurf-700">
            {order.status}
          </span>
        </div>
        <div className="mt-2 text-sm text-ink/60">{formatDateTime(order.createdAt)}</div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Envío</h2>
            <p className="mt-2 text-sm">
              {addr.firstName} {addr.lastName}<br />
              {addr.addressLine}{addr.addressLine2 ? `, ${addr.addressLine2}` : ""}<br />
              {addr.postalCode} {addr.city}, {addr.region}<br />
              {addr.country}
            </p>
            {order.trackingNumber && (
              <p className="mt-3 text-sm">
                <strong>Tracking:</strong> {order.trackingCarrier} {order.trackingNumber}
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Pago</h2>
            <p className="mt-2 text-sm">
              <strong>Método:</strong> {order.paymentProvider} <br />
              <strong>Estado:</strong> {order.paymentStatus} <br />
              <strong>Total:</strong> {formatPrice(order.total)}
            </p>
          </section>
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Productos</h2>
          <ul className="mt-3 divide-y divide-ink/10 rounded-2xl border border-ink/10">
            {order.items.map((it) => (
              <li key={it.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-4 text-sm">
                <div>
                  <div className="font-bold">{it.productName}</div>
                  <div className="text-xs text-ink/60">{it.variantLabel}</div>
                </div>
                <div className="text-xs text-ink/60">×{it.quantity}</div>
                <div className="font-bold">{formatPrice(it.totalPrice)}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Historial</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.history.map((h) => (
              <li key={h.id} className="rounded-md border border-ink/10 px-4 py-2">
                <span className="font-bold uppercase">{h.toStatus}</span>{" "}
                <span className="text-ink/60">— {formatDateTime(h.createdAt)}</span>
                {h.note && <div className="text-xs text-ink/60">{h.note}</div>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
