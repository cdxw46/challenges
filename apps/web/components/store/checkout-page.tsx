"use client";

import { useMemo, useState } from "react";
import { CreditCard, MapPinHouse, Truck } from "lucide-react";

import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type CheckoutPageProps = {
  cart: {
    items: Array<{
      id: string;
      quantity: number;
      name: string;
      colorName: string;
      size: string;
      lineTotal: number;
    }>;
    summary: {
      subtotal: number;
      discount: number;
      shipping: number;
      tax: number;
      total: number;
    };
  };
};

const shippingMethods = [
  { code: "standard", label: "Estandar", description: "3-5 dias", price: 4.95 },
  { code: "express", label: "Express", description: "1-2 dias", price: 8.95 },
  { code: "pickup", label: "Recogida en punto", description: "2-4 dias", price: 2.95 },
];

const paymentMethods = ["Tarjeta / Stripe", "PayPal", "Klarna", "Bizum", "Apple Pay / Google Pay"];

export function CheckoutPage({ cart }: CheckoutPageProps) {
  const [step, setStep] = useState(1);
  const [shippingMethod, setShippingMethod] = useState("standard");

  const totals = useMemo(() => {
    const selected = shippingMethods.find((item) => item.code === shippingMethod);
    const shipping = selected?.price ?? cart.summary.shipping;
    const total = cart.summary.subtotal - cart.summary.discount + cart.summary.tax + shipping;
    return { shipping, total };
  }, [cart.summary, shippingMethod]);

  return (
    <div className="page-shell page-stack">
      <section className="listing-hero">
        <div>
          <span className="section-eyebrow">Checkout</span>
          <h1>Pago seguro y direccion en tres pasos.</h1>
          <p>Arquitectura preparada para Stripe Elements, wallets, PayPal, Klarna y Bizum.</p>
        </div>
      </section>

      <div className="checkout-grid">
        <div className="checkout-steps">
          <article className={`card checkout-card ${step === 1 ? "active" : ""}`}>
            <div className="checkout-head">
              <span>1</span>
              <div>
                <h2>Contacto y direccion</h2>
                <p>Email, nombre, telefono y direccion de envio.</p>
              </div>
            </div>
            <div className="checkout-form">
              <div className="checkout-field-grid">
                <input placeholder="Email" defaultValue="cliente@smurfx.com" />
                <input placeholder="Telefono" defaultValue="+34 600 000 000" />
              </div>
              <div className="checkout-field-grid">
                <input placeholder="Nombre" defaultValue="Nombre" />
                <input placeholder="Apellidos" defaultValue="Apellidos" />
              </div>
              <input placeholder="Direccion" defaultValue="Gran Via 100" />
              <div className="checkout-field-grid">
                <input placeholder="Ciudad" defaultValue="Madrid" />
                <input placeholder="Provincia" defaultValue="Madrid" />
                <input placeholder="Codigo postal" defaultValue="28013" />
              </div>
              <Button onClick={() => setStep(2)}>Continuar al envio</Button>
            </div>
          </article>

          <article className={`card checkout-card ${step === 2 ? "active" : ""}`}>
            <div className="checkout-head">
              <span>2</span>
              <div>
                <h2>Metodo de envio</h2>
                <p>Tarifas configurables por zona y carrier.</p>
              </div>
            </div>
            <div className="checkout-options">
              {shippingMethods.map((method) => (
                <label key={method.code} className="checkout-option">
                  <input
                    type="radio"
                    name="shippingMethod"
                    checked={shippingMethod === method.code}
                    onChange={() => setShippingMethod(method.code)}
                  />
                  <div>
                    <strong>{method.label}</strong>
                    <p>{method.description}</p>
                  </div>
                  <span>{formatPrice(method.price)}</span>
                </label>
              ))}
              <Button onClick={() => setStep(3)}>Continuar al pago</Button>
            </div>
          </article>

          <article className={`card checkout-card ${step === 3 ? "active" : ""}`}>
            <div className="checkout-head">
              <span>3</span>
              <div>
                <h2>Pago</h2>
                <p>PCI-ready: los datos de tarjeta no tocan el servidor.</p>
              </div>
            </div>
            <div className="checkout-options">
              {paymentMethods.map((method) => (
                <div key={method} className="checkout-option">
                  <div>
                    <strong>{method}</strong>
                    <p>Disponible cuando se configuren credenciales reales.</p>
                  </div>
                </div>
              ))}
              <div className="card static-page-card">
                <div className="static-page-body">
                  <h3>Integracion lista</h3>
                  <ul className="static-page-list">
                    <li><CreditCard size={16} /> Stripe Payment Element / Express Checkout</li>
                    <li><Truck size={16} /> Shipping y taxes calculados en servidor</li>
                    <li><MapPinHouse size={16} /> Google Places listo por clave de entorno</li>
                  </ul>
                </div>
              </div>
              <Button>Confirmar pedido</Button>
            </div>
          </article>
        </div>

        <aside className="card checkout-summary">
          <h2>Resumen</h2>
          <div className="checkout-order-list">
            {cart.items.map((item) => (
              <div key={item.id} className="checkout-order-line">
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.colorName} · {item.size} · x{item.quantity}
                  </p>
                </div>
                <span>{formatPrice(item.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="summary-table">
            <div><span>Subtotal</span><strong>{formatPrice(cart.summary.subtotal)}</strong></div>
            <div><span>Descuento</span><strong>-{formatPrice(cart.summary.discount)}</strong></div>
            <div><span>Impuestos</span><strong>{formatPrice(cart.summary.tax)}</strong></div>
            <div><span>Envio</span><strong>{formatPrice(totals.shipping)}</strong></div>
            <div className="summary-total"><span>Total</span><strong>{formatPrice(totals.total)}</strong></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
