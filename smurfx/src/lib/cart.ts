import "server-only";
import { prisma } from "./prisma";
import { getCurrentUser, getOrCreateGuestId } from "./auth";
import { effectivePrice } from "./format";
import { SHIPPING_OPTIONS, SHIPPING_FREE_THRESHOLD, TAX_RATE } from "./shipping";

export { SHIPPING_OPTIONS, SHIPPING_FREE_THRESHOLD, TAX_RATE };

export async function getOrCreateCart() {
  const user = await getCurrentUser();
  if (user) {
    let cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      include: cartInclude()
    });
    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: user.id },
        include: cartInclude()
      });
    }
    return cart;
  }
  const guestId = getOrCreateGuestId();
  let cart = await prisma.cart.findUnique({
    where: { guestId },
    include: cartInclude()
  });
  if (!cart) {
    cart = await prisma.cart.create({ data: { guestId }, include: cartInclude() });
  }
  return cart;
}

export function cartInclude() {
  return {
    items: {
      include: {
        variant: {
          include: {
            product: { include: { images: true } }
          }
        }
      }
    },
    coupon: true
  } as const;
}

export type FullCart = Awaited<ReturnType<typeof getOrCreateCart>>;

export function summarizeCart(
  cart: FullCart,
  shippingId: string = "standard"
) {
  const items = cart.items.map((it) => {
    const p = it.variant.product;
    const unit = effectivePrice(p.basePrice, p.salePrice) + it.variant.priceDelta;
    return {
      id: it.id,
      variantId: it.variantId,
      productId: p.id,
      slug: p.slug,
      name: p.name,
      image: p.images[0]?.url ?? null,
      size: it.variant.size,
      color: it.variant.color,
      colorHex: it.variant.colorHex,
      sku: it.variant.sku,
      stock: it.variant.stock,
      quantity: it.quantity,
      unit,
      lineTotal: unit * it.quantity
    };
  });

  const subtotal = items.reduce((acc, it) => acc + it.lineTotal, 0);
  let discount = 0;
  let shippingPrice = SHIPPING_OPTIONS.find((s) => s.id === shippingId)?.price ?? 0;

  if (cart.coupon && cart.coupon.active) {
    if (cart.coupon.type === "percentage") {
      discount = +(subtotal * (cart.coupon.value / 100)).toFixed(2);
    } else if (cart.coupon.type === "fixed") {
      discount = Math.min(subtotal, cart.coupon.value);
    } else if (cart.coupon.type === "free_shipping") {
      shippingPrice = 0;
    }
  }
  if (subtotal - discount >= SHIPPING_FREE_THRESHOLD && shippingId === "standard") {
    shippingPrice = 0;
  }
  const taxableBase = Math.max(0, subtotal - discount);
  const tax = +(taxableBase * (TAX_RATE / (1 + TAX_RATE))).toFixed(2); // precios con IVA incluido
  const total = +(taxableBase + shippingPrice).toFixed(2);

  return {
    items,
    subtotal: +subtotal.toFixed(2),
    discount: +discount.toFixed(2),
    shipping: +shippingPrice.toFixed(2),
    shippingId,
    tax,
    total,
    couponCode: cart.coupon?.code ?? null,
    itemCount: items.reduce((a, it) => a + it.quantity, 0)
  };
}

export async function mergeGuestCartIntoUserCart(userId: string, guestId: string) {
  const guest = await prisma.cart.findUnique({
    where: { guestId },
    include: { items: true }
  });
  if (!guest || guest.items.length === 0) return;
  const userCart = await prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: { items: true }
  });
  for (const item of guest.items) {
    const existing = userCart.items.find((i) => i.variantId === item.variantId);
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + item.quantity }
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: userCart.id,
          variantId: item.variantId,
          quantity: item.quantity
        }
      });
    }
  }
  await prisma.cart.delete({ where: { id: guest.id } });
}
