import { handle, json, error } from "@/lib/api";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { getOrCreateCart } from "@/lib/cart";
import { getCurrentUser } from "@/lib/auth";
import { createOrderFromCart } from "@/lib/orders";

const schema = z.object({
  paymentIntentId: z.string(),
  email: z.string().email(),
  shippingId: z.string(),
  shippingAddress: z.any()
});

export const POST = handle(async (req) => {
  const data = schema.parse(await req.json());
  const stripe = getStripe();
  if (!stripe) return error(400, "Stripe no configurado");
  const intent = await stripe.paymentIntents.retrieve(data.paymentIntentId);
  if (intent.status !== "succeeded") return error(400, `Pago no completado (estado: ${intent.status})`);

  const cart = await getOrCreateCart();
  if (cart.items.length === 0) return error(400, "Carrito vacío");
  const user = await getCurrentUser();
  const order = await createOrderFromCart({
    cart,
    email: data.email,
    userId: user?.id ?? null,
    shippingId: data.shippingId,
    shippingAddress: data.shippingAddress,
    paymentProvider: "stripe",
    paymentRef: intent.id,
    paymentStatus: "paid"
  });
  return json({ ok: true, orderNumber: order.number });
});
