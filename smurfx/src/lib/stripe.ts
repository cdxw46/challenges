import Stripe from "stripe";

let _stripe: Stripe | null = null;
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key, { apiVersion: "2024-09-30.acacia" as any });
  return _stripe;
}

export function isStripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
