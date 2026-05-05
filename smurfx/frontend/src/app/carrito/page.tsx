"use client";

import Image from "next/image";
import Link from "next/link";
import { useCartStore } from "@/store/cartStore";
import { useState, useEffect } from "react";

export default function CartPage() {
  const { items, removeItem, updateQuantity, total } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="p-12 text-center">Cargando carrito...</div>;

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/checkout/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          customerEmail: "customer@smurfx.com", // In a real app, get from auth
        }),
      });
      
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Error al iniciar el pago: " + (data.error || "Desconocido"));
      }
    } catch (error) {
      console.error(error);
      alert("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <h1 className="text-3xl font-black uppercase mb-6">Tu carrito está vacío</h1>
        <p className="text-gray-600 mb-8">Parece que aún no has añadido ningún producto.</p>
        <Link href="/" className="bg-black text-white px-8 py-4 rounded-full font-bold hover:bg-gray-800 transition-colors">
          Explorar productos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 w-full">
      <h1 className="text-3xl font-black uppercase tracking-tight mb-8">Carrito</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {items.map((item) => (
            <div key={`${item.id}-${item.size}-${item.color}`} className="flex gap-6 border-b border-gray-200 pb-6">
              <div className="relative w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                <Image src={item.image} alt={item.name} fill className="object-cover" />
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-bold text-lg">{item.name}</h3>
                    <p className="text-gray-500 text-sm">Talla: {item.size} | Color: {item.color}</p>
                  </div>
                  <p className="font-bold">{item.price.toFixed(2)} €</p>
                </div>
                <div className="flex justify-between items-center mt-4">
                  <div className="flex items-center border border-gray-300 rounded-full">
                    <button 
                      onClick={() => updateQuantity(item.id, item.size, item.color, Math.max(1, item.quantity - 1))}
                      className="px-3 py-1 hover:bg-gray-100 rounded-l-full"
                    >-</button>
                    <span className="px-3 py-1 text-sm font-medium">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.id, item.size, item.color, item.quantity + 1)}
                      className="px-3 py-1 hover:bg-gray-100 rounded-r-full"
                    >+</button>
                  </div>
                  <button 
                    onClick={() => removeItem(item.id, item.size, item.color)}
                    className="text-sm text-red-600 hover:text-red-800 underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gray-50 p-8 rounded-xl h-fit">
          <h2 className="text-2xl font-bold mb-6">Resumen</h2>
          <div className="flex justify-between mb-4 text-gray-600">
            <span>Subtotal</span>
            <span>{total().toFixed(2)} €</span>
          </div>
          <div className="flex justify-between mb-4 text-gray-600">
            <span>Envío estimado</span>
            <span>Gratis</span>
          </div>
          <div className="border-t border-gray-300 my-4 pt-4 flex justify-between font-bold text-xl">
            <span>Total</span>
            <span>{total().toFixed(2)} €</span>
          </div>
          <button 
            onClick={handleCheckout}
            disabled={loading}
            className="w-full bg-black text-white py-4 rounded-full font-bold text-lg hover:bg-gray-800 transition-colors mt-6 disabled:opacity-50"
          >
            {loading ? "Procesando..." : "Proceder al pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
