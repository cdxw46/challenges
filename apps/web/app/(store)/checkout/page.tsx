import { CheckoutPage } from "@/components/store/checkout-page";
import { getCartView } from "@/lib/cart";

export default async function CheckoutRoute() {
  const cart = await getCartView();
  return <CheckoutPage cart={cart} />;
}
