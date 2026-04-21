import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const CART_COOKIE = "smurfx_cart";
const CART_INCLUDE = {
  items: {
    include: {
      product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
      variant: true,
    },
  },
  shippingMethod: true,
} as const;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value ?? 0);
}

type CartOptions = {
  createIfMissing?: boolean;
  writeGuestCookie?: boolean;
};

function emptyCartView() {
  return {
    id: "guest",
    couponCode: null,
    shippingMethod: null,
    items: [],
    summary: {
      subtotal: 0,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 0,
    },
  };
}

async function getCartById(id: string) {
  return db.cart.findUnique({
    where: { id },
    include: CART_INCLUDE,
  });
}

function mapCartView(
  cart:
    | Awaited<ReturnType<typeof getCartById>>
    | Awaited<ReturnType<typeof getOrCreateCart>>
    | null,
) {
  if (!cart) return emptyCartView();

  const subtotal = cart.items.reduce((acc, item) => acc + toNumber(item.lineTotal), 0);
  const shipping = cart.shippingMethod ? toNumber(cart.shippingMethod.price) : 0;
  const discount = cart.couponCode === "MOVEINBLUE10" ? subtotal * 0.1 : 0;
  const tax = (subtotal - discount + shipping) * 0.21;
  const total = subtotal - discount + shipping + tax;

  return {
    id: cart.id,
    couponCode: cart.couponCode,
    shippingMethod: cart.shippingMethod,
    items: cart.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      lineTotal: toNumber(item.lineTotal),
      productId: item.productId,
      variantId: item.variantId,
      name: item.product.name,
      slug: item.product.slug,
      image: item.product.images[0]?.url ?? "",
      colorName: item.variant.colorName,
      size: item.variant.size,
      sku: item.variant.sku,
    })),
    summary: {
      subtotal,
      discount,
      shipping,
      tax,
      total,
    },
  };
}

export async function getOrCreateCart({
  createIfMissing = true,
  writeGuestCookie = false,
}: CartOptions = {}) {
  const user = await getCurrentUser();
  const store = await cookies();
  const existingGuestToken = store.get(CART_COOKIE)?.value;

  let cart =
    (user
      ? await db.cart.findFirst({
          where: { userId: user.id },
          include: CART_INCLUDE,
        })
      : null) ??
    (existingGuestToken
      ? await db.cart.findFirst({
          where: { guestToken: existingGuestToken },
          include: CART_INCLUDE,
        })
      : null);

  if (!cart && !createIfMissing) {
    return null;
  }

  if (!cart) {
    const guestToken = existingGuestToken ?? crypto.randomUUID();
    cart = await db.cart.create({
      data: {
        userId: user?.id,
        guestToken: user ? undefined : guestToken,
      },
      include: CART_INCLUDE,
    });

    if (!user && writeGuestCookie) {
      store.set(CART_COOKIE, guestToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
  }

  return cart;
}

export async function getCartView() {
  const cart = await getOrCreateCart({ createIfMissing: false, writeGuestCookie: false });
  return mapCartView(cart);
}

export async function addItemToCart(variantId: string, quantity = 1) {
  const cart = await getOrCreateCart({ createIfMissing: true, writeGuestCookie: true });
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) {
    throw new Error("Variante no encontrada");
  }

  const unitPrice = variant.priceOverride ?? variant.product.basePrice;
  const numericPrice = toNumber(unitPrice);

  const existing = await db.cartItem.findFirst({
    where: { cartId: cart.id, variantId },
  });

  if (existing) {
    const nextQuantity = existing.quantity + quantity;
    await db.cartItem.update({
      where: { id: existing.id },
      data: {
        quantity: nextQuantity,
        lineTotal: numericPrice * nextQuantity,
      },
    });
  } else {
    await db.cartItem.create({
      data: {
        cartId: cart.id,
        productId: variant.productId,
        variantId,
        quantity,
        unitPrice: numericPrice,
        lineTotal: numericPrice * quantity,
      },
    });
  }

  return mapCartView(await getCartById(cart.id));
}

export async function updateCartItem(itemId: string, quantity: number) {
  if (quantity <= 0) {
    return removeCartItem(itemId);
  }

  const item = await db.cartItem.findUnique({ where: { id: itemId } });
  if (!item) return getCartView();

  const unitPrice = toNumber(item.unitPrice);
  await db.cartItem.update({
    where: { id: itemId },
    data: {
      quantity,
      lineTotal: unitPrice * quantity,
    },
  });

  return mapCartView(await getCartById(item.cartId));
}

export async function removeCartItem(itemId: string) {
  const item = await db.cartItem.findUnique({ where: { id: itemId } });
  await db.cartItem.deleteMany({ where: { id: itemId } });
  if (!item) return getCartView();
  return mapCartView(await getCartById(item.cartId));
}

export async function applyCoupon(code: string) {
  const cart = await getOrCreateCart({ createIfMissing: true, writeGuestCookie: true });
  const coupon = await db.coupon.findFirst({
    where: {
      code: code.toUpperCase(),
      isActive: true,
    },
  });

  await db.cart.update({
    where: { id: cart.id },
    data: { couponCode: coupon ? coupon.code : null },
  });

  return mapCartView(await getCartById(cart.id));
}
