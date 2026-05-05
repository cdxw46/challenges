import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getOrCreateCart, summarizeCart } from "@/lib/cart";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const { code } = await req.json();
  if (!code) return error(400, "Código requerido");
  const coupon = await prisma.coupon.findUnique({ where: { code: String(code).toUpperCase() } });
  if (!coupon || !coupon.active) return error(400, "Cupón inválido");
  if (coupon.endsAt && coupon.endsAt < new Date()) return error(400, "Cupón expirado");
  if (coupon.startsAt && coupon.startsAt > new Date()) return error(400, "Cupón aún no activo");
  if (coupon.maxUses && coupon.uses >= coupon.maxUses) return error(400, "Cupón agotado");
  const cart = await getOrCreateCart();
  const summary = summarizeCart({ ...cart, coupon } as any);
  if (coupon.minSubtotal && summary.subtotal < coupon.minSubtotal) {
    return error(400, `Subtotal mínimo: ${coupon.minSubtotal.toFixed(2)}€`);
  }
  await prisma.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id } });
  const refreshed = await getOrCreateCart();
  return json(summarizeCart(refreshed));
});

export const DELETE = handle(async () => {
  const cart = await getOrCreateCart();
  await prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
  const refreshed = await getOrCreateCart();
  return json(summarizeCart(refreshed));
});
