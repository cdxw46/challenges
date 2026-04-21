import { CartPage } from "@/components/store/cart-page";
import { getCartView } from "@/lib/cart";

export default async function CartRoute() {
  const cart = await getCartView();
  return <CartPage initialCart={cart} />;
}
