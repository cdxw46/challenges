import { CheckoutFlow } from "@/components/checkout-flow";
export const metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="container-x py-10">
      <h1 className="h-display mb-6 text-3xl">Finalizar compra</h1>
      <CheckoutFlow stripePk={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""} />
    </div>
  );
}
