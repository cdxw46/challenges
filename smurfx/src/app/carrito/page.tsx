import { CartView } from "@/components/cart-view";

export const metadata = { title: "Carrito" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="container-x py-10">
      <h1 className="h-display mb-8 text-4xl">Tu carrito</h1>
      <CartView />
    </div>
  );
}
