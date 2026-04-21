import { handle, json, error } from "@/lib/api";
import { z } from "zod";
import { getOrCreateCart, summarizeCart } from "@/lib/cart";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { createOrderFromCart } from "@/lib/orders";

const schema = z.object({
  email: z.string().email(),
  shippingId: z.string(),
  shippingAddress: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    addressLine: z.string().min(1),
    addressLine2: z.string().optional().nullable(),
    city: z.string().min(1),
    region: z.string().min(1),
    postalCode: z.string().min(3),
    country: z.string().min(2),
    phone: z.string().optional().nullable()
  }),
  paymentMethod: z.enum(["stripe", "manual", "paypal", "klarna", "bizum"]),
  paymentRef: z.string().optional().nullable()
});

export const POST = handle(async (req) => {
  const data = schema.parse(await req.json());
  const cart = await getOrCreateCart();
  const summary = summarizeCart(cart, data.shippingId);
  if (summary.items.length === 0) return error(400, "Carrito vacío");
  const user = await getCurrentUser();

  if (data.paymentMethod === "stripe") {
    if (!isStripeEnabled()) {
      return error(
        400,
        "Stripe no está configurado en el servidor. Añade STRIPE_SECRET_KEY y vuelve a intentarlo."
      );
    }
    const stripe = getStripe()!;
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(summary.total * 100),
      currency: "eur",
      receipt_email: data.email,
      automatic_payment_methods: { enabled: true },
      metadata: {
        cartId: cart.id,
        userId: user?.id ?? "",
        shippingId: data.shippingId
      }
    });
    return json({
      provider: "stripe",
      clientSecret: intent.client_secret,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      summary
    });
  }

  // Manual / cash on delivery / Bizum confirm-after / etc.
  const order = await createOrderFromCart({
    cart,
    email: data.email,
    userId: user?.id ?? null,
    shippingId: data.shippingId,
    shippingAddress: data.shippingAddress,
    paymentProvider: data.paymentMethod === "manual" ? "manual" : data.paymentMethod,
    paymentRef: data.paymentRef ?? undefined,
    paymentStatus: data.paymentMethod === "manual" ? "pending" : "paid"
  });
  return json({ ok: true, orderNumber: order.number });
});
