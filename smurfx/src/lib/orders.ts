import { prisma } from "./prisma";
import { summarizeCart, type FullCart } from "./cart";
import { sendMail, brandedEmail } from "./mailer";
import { formatPrice } from "./format";

export function newOrderNumber() {
  return `SMX-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

export async function createOrderFromCart(opts: {
  cart: FullCart;
  email: string;
  userId?: string | null;
  shippingId: string;
  shippingAddress: any;
  billingAddress?: any;
  paymentProvider: "stripe" | "paypal" | "klarna" | "bizum" | "manual";
  paymentRef?: string;
  paymentStatus?: "pending" | "paid";
}) {
  const summary = summarizeCart(opts.cart, opts.shippingId);
  if (summary.items.length === 0) throw new Error("Carrito vacío");

  for (const it of summary.items) {
    const v = await prisma.productVariant.findUnique({ where: { id: it.variantId } });
    if (!v || v.stock < it.quantity) {
      throw new Error(`Stock insuficiente para ${it.name} (${it.size}/${it.color})`);
    }
  }

  const number = newOrderNumber();
  const order = await prisma.order.create({
    data: {
      number,
      userId: opts.userId ?? null,
      email: opts.email.toLowerCase(),
      status: opts.paymentStatus === "paid" ? "paid" : "pending",
      subtotal: summary.subtotal,
      discount: summary.discount,
      shipping: summary.shipping,
      tax: summary.tax,
      total: summary.total,
      currency: "EUR",
      shippingMethod: summary.shippingId,
      shippingAddress: JSON.stringify(opts.shippingAddress),
      billingAddress: opts.billingAddress ? JSON.stringify(opts.billingAddress) : null,
      paymentProvider: opts.paymentProvider,
      paymentRef: opts.paymentRef ?? null,
      paymentStatus: opts.paymentStatus ?? "pending",
      couponId: opts.cart.couponId ?? null,
      items: {
        create: summary.items.map((it) => ({
          variantId: it.variantId,
          productName: it.name,
          variantLabel: `${it.color} / ${it.size}`,
          unitPrice: it.unit,
          quantity: it.quantity,
          totalPrice: it.lineTotal
        }))
      },
      history: {
        create: { toStatus: opts.paymentStatus === "paid" ? "paid" : "pending", note: "Pedido creado" }
      }
    },
    include: { items: true }
  });

  for (const it of summary.items) {
    await prisma.productVariant.update({
      where: { id: it.variantId },
      data: {
        stock: { decrement: it.quantity },
        inventoryMovements: {
          create: { delta: -it.quantity, reason: `order:${number}` }
        }
      }
    });
  }

  if (opts.cart.couponId) {
    await prisma.coupon.update({
      where: { id: opts.cart.couponId },
      data: { uses: { increment: 1 } }
    });
    await prisma.couponUse.create({
      data: { couponId: opts.cart.couponId, userId: opts.userId ?? null, orderId: order.id }
    });
  }

  await prisma.cart.update({
    where: { id: opts.cart.id },
    data: { items: { deleteMany: {} }, couponId: null }
  });

  if (opts.userId && opts.paymentStatus === "paid") {
    const points = Math.round(summary.total * 10);
    await prisma.user.update({
      where: { id: opts.userId },
      data: {
        membersPoints: { increment: points },
        pointsTx: { create: { points, reason: "purchase", reference: number } }
      }
    });
  }

  await sendMail({
    to: opts.email,
    subject: `Pedido confirmado · ${number}`,
    html: brandedEmail(
      `Gracias por tu pedido`,
      `<p>Tu pedido <strong>${number}</strong> ha sido recibido.</p>
       <ul>${summary.items
         .map(
           (it) =>
             `<li>${it.quantity}× ${it.name} — ${it.color}/${it.size} — ${formatPrice(it.lineTotal)}</li>`
         )
         .join("")}</ul>
       <p><strong>Total: ${formatPrice(summary.total)}</strong></p>`,
      "Ver pedido",
      `${process.env.NEXT_PUBLIC_SITE_URL}/cuenta/pedidos/${number}`
    )
  });

  return order;
}
