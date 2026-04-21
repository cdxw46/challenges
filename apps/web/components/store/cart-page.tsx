"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

type CartView = {
  id: string;
  couponCode: string | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    name: string;
    slug: string;
    image: string;
    colorName: string;
    size: string;
    sku: string;
  }>;
  summary: {
    subtotal: number;
    discount: number;
    shipping: number;
    tax: number;
    total: number;
  };
};

type CartPageProps = {
  initialCart: CartView;
};

export function CartPage({ initialCart }: CartPageProps) {
  const [cart, setCart] = useState(initialCart);
  const [coupon, setCoupon] = useState(initialCart.couponCode ?? "");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const suggestions = useMemo(
    () => [
      { name: "SmurfAir Max One", href: "/producto/smurfair-max-one-azul" },
      { name: "SmurfTrail Ridge", href: "/producto/smurftrail-ridge-negro" },
    ],
    [],
  );

  async function patchItem(itemId: string, quantity: number) {
    setLoadingId(itemId);
    const response = await fetch("/api/cart/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, quantity }),
    });
    const payload = await response.json();
    setCart(payload.cart);
    setLoadingId(null);
  }

  async function removeItem(itemId: string) {
    setLoadingId(itemId);
    const response = await fetch(`/api/cart/items?itemId=${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    setCart(payload.cart);
    setLoadingId(null);
  }

  async function applyCoupon() {
    const response = await fetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "coupon", code: coupon }),
    });
    const payload = await response.json();
    setCart(payload.cart);
  }

  return (
    <div className="page-shell page-stack">
      <section className="listing-hero">
        <div>
          <span className="section-eyebrow">Carrito</span>
          <h1>Tu seleccion SMURFX.</h1>
          <p>Gestiona cantidades, descuento, envio y pasa al checkout cuando quieras.</p>
        </div>
      </section>

      <div className="cart-layout">
        <section className="card cart-items">
          <div className="static-page-body">
            {cart.items.length ? (
              cart.items.map((item) => (
                <article key={item.id} className="cart-line">
                  <Link href={`/producto/${item.slug}`} className="cart-line-image">
                    <Image src={item.image} alt={item.name} fill className="object-cover" />
                  </Link>
                  <div className="cart-line-copy">
                    <div>
                      <h3>{item.name}</h3>
                      <p className="muted">
                        {item.colorName} · {item.size}
                      </p>
                    </div>
                    <div className="cart-line-controls">
                      <div className="qty-control">
                        <button
                          type="button"
                          disabled={loadingId === item.id}
                          onClick={() => patchItem(item.id, item.quantity - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          disabled={loadingId === item.id}
                          onClick={() => patchItem(item.id, item.quantity + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <strong>{formatPrice(item.lineTotal)}</strong>
                      <button
                        type="button"
                        className="icon-chip"
                        disabled={loadingId === item.id}
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <ShoppingBag size={32} />
                <h2>Tu carrito esta vacio.</h2>
                <p className="muted">Explora lanzamientos y vuelve cuando tengas tu seleccion lista.</p>
                <Button href="/">Volver a la tienda</Button>
              </div>
            )}
          </div>
        </section>

        <aside className="card cart-summary">
          <div className="static-page-body">
            <h2>Resumen</h2>
            <div className="coupon-row">
              <input
                value={coupon}
                onChange={(event) => setCoupon(event.target.value)}
                placeholder="Codigo descuento"
              />
              <Button type="button" variant="secondary" onClick={applyCoupon}>
                Aplicar
              </Button>
            </div>
            <div className="summary-list">
              <div>
                <span>Subtotal</span>
                <strong>{formatPrice(cart.summary.subtotal)}</strong>
              </div>
              <div>
                <span>Descuento</span>
                <strong>-{formatPrice(cart.summary.discount)}</strong>
              </div>
              <div>
                <span>Envio</span>
                <strong>{formatPrice(cart.summary.shipping)}</strong>
              </div>
              <div>
                <span>Impuestos</span>
                <strong>{formatPrice(cart.summary.tax)}</strong>
              </div>
              <div className="summary-total">
                <span>Total</span>
                <strong>{formatPrice(cart.summary.total)}</strong>
              </div>
            </div>
            <Button href="/checkout" className="full-width">
              Proceder al pago
            </Button>
            <div className="suggestion-list">
              <h3>Te puede interesar</h3>
              {suggestions.map((item) => (
                <Link key={item.href} href={item.href} className="filter-chip">
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
