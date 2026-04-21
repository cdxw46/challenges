import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getOrCreateCart, summarizeCart } from "@/lib/cart";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const shipping = url.searchParams.get("shipping") || "standard";
  const cart = await getOrCreateCart();
  return json(summarizeCart(cart, shipping));
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const variantId = body.variantId as string;
  const quantity = Math.max(1, Math.min(20, Number(body.quantity || 1)));
  if (!variantId) return error(400, "variantId requerido");
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) return error(404, "Variante no encontrada");
  if (variant.stock < quantity) return error(400, "Stock insuficiente");
  const cart = await getOrCreateCart();
  const existing = cart.items.find((i) => i.variantId === variantId);
  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: Math.min(variant.stock, existing.quantity + quantity) }
    });
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, variantId, quantity }
    });
  }
  const refreshed = await getOrCreateCart();
  return json(summarizeCart(refreshed));
});

export const PATCH = handle(async (req) => {
  const { itemId, quantity } = await req.json();
  const cart = await getOrCreateCart();
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) return error(404, "Item no encontrado");
  const qty = Math.max(1, Math.min(item.variant.stock, Number(quantity)));
  await prisma.cartItem.update({ where: { id: itemId }, data: { quantity: qty } });
  const refreshed = await getOrCreateCart();
  return json(summarizeCart(refreshed));
});

export const DELETE = handle(async (req) => {
  const url = new URL(req.url);
  const itemId = url.searchParams.get("itemId");
  if (!itemId) return error(400, "itemId requerido");
  const cart = await getOrCreateCart();
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) return error(404, "Item no encontrado");
  await prisma.cartItem.delete({ where: { id: itemId } });
  const refreshed = await getOrCreateCart();
  return json(summarizeCart(refreshed));
});
