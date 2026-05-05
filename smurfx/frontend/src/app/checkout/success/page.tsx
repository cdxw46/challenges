"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCartStore } from "@/store/cartStore";

export default function SuccessPage() {
  const clearCart = useCartStore((state) => state.clearCart);

  useEffect(() => {
    // Clear the cart on successful checkout
    clearCart();
  }, [clearCart]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-24 text-center">
      <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
        </svg>
      </div>
      <h1 className="text-4xl font-black uppercase mb-4">¡Pedido Confirmado!</h1>
      <p className="text-xl text-gray-600 mb-12">
        Gracias por tu compra en SMURFX. Hemos enviado un correo de confirmación con los detalles de tu pedido.
      </p>
      <Link href="/" className="bg-black text-white px-8 py-4 rounded-full font-bold hover:bg-gray-800 transition-colors">
        Volver a la tienda
      </Link>
    </div>
  );
}
