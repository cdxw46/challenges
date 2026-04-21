import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatPrice, formatDateTime } from "@/lib/format";
import { OrderAdminControls } from "@/components/admin/order-controls";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { items: true, history: { orderBy: { createdAt: "asc" } } }
  });
  if (!order) notFound();
  const addr = JSON.parse(order.shippingAddress);
  return (
    <div className="p-8">
      <h1 className="h-display text-3xl">Pedido {order.number}</h1>
      <div className="mt-2 text-xs text-ink/60">{formatDateTime(order.createdAt)}</div>
      <div className="mt-6 grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Productos</h2>
            <ul className="mt-3 divide-y divide-ink/10 text-sm">
              {order.items.map((it) => (
                <li key={it.id} className="grid grid-cols-[1fr_auto_auto] gap-4 py-3">
                  <div>
                    <div className="font-bold">{it.productName}</div>
                    <div className="text-xs text-ink/60">{it.variantLabel}</div>
                  </div>
                  <div className="text-xs text-ink/60">×{it.quantity}</div>
                  <div className="font-bold">{formatPrice(it.totalPrice)}</div>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="text-ink/60">Subtotal</div><div className="text-right">{formatPrice(order.subtotal)}</div>
              {order.discount > 0 && (<><div className="text-smurf-500">Descuento</div><div className="text-right text-smurf-500">-{formatPrice(order.discount)}</div></>)}
              <div className="text-ink/60">Envío</div><div className="text-right">{formatPrice(order.shipping)}</div>
              <div className="text-ink/60">IVA incluido</div><div className="text-right">{formatPrice(order.tax)}</div>
              <div className="font-bold">Total</div><div className="text-right font-bold">{formatPrice(order.total)}</div>
            </div>
          </section>

          <section className="rounded-2xl border border-ink/10 p-5">
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

        <div className="space-y-6">
          <section className="rounded-2xl border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Cliente</h2>
            <p className="mt-2 text-sm">{order.email}</p>
          </section>
          <section className="rounded-2xl border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Envío</h2>
            <p className="mt-2 text-sm">
              {addr.firstName} {addr.lastName}<br />
              {addr.addressLine}<br />
              {addr.postalCode} {addr.city}, {addr.region}<br />{addr.country}
            </p>
          </section>
          <section className="rounded-2xl border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-ink/70">Acciones</h2>
            <OrderAdminControls order={{ id: order.id, status: order.status, trackingCarrier: order.trackingCarrier, trackingNumber: order.trackingNumber }} />
          </section>
        </div>
      </div>
    </div>
  );
}
