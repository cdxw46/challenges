import { handle, json } from "@/lib/api";
import { getStripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return json({ ok: false, reason: "stripe_disabled" });
  const sig = headers().get("stripe-signature") || "";
  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e: any) {
    return json({ error: `Webhook signature error: ${e.message}` }, 400);
  }
  await prisma.auditLog.create({
    data: { action: `stripe:${event.type}`, entity: "webhook", meta: event.id }
  });
  return json({ received: true });
});
