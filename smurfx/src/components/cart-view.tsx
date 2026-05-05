"use client";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "./cart-provider";
import { formatPrice } from "@/lib/format";
import { SHIPPING_OPTIONS } from "@/lib/shipping";
import { Trash, Plus, Minus, Truck, Shield } from "./icons";

export function CartView() {
  const { cart, update, remove, applyCoupon, clearCoupon, setShipping, refresh } = useCart();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (cart.items.length === 0) {
    return (
      <div className="rounded-2xl border border-ink/10 p-10 text-center">
        <p className="text-lg">Tu carrito está vacío.</p>
        <Link href="/hombre" className="btn-primary mt-4 inline-flex">
          Empezar a comprar
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <ul className="divide-y divide-ink/10">
        {cart.items.map((it) => (
          <li key={it.id} className="grid grid-cols-[100px_1fr_auto] gap-5 py-5">
            <div className="aspect-square overflow-hidden rounded-xl bg-smurf-50">
              {it.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image} alt={it.name} className="h-full w-full object-cover" />
              )}
            </div>
            <div>
              <Link href={`/producto/${it.slug}`} className="text-base font-bold leading-tight">
                {it.name}
              </Link>
              <div className="mt-1 text-xs text-ink/60">
                Talla {it.size} · {it.color} · SKU {it.sku}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex items-center rounded-full border border-ink/15">
                  <button onClick={() => update(it.id, Math.max(1, it.quantity - 1))} className="grid h-9 w-9 place-items-center" aria-label="Restar">
                    <Minus size={14} />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{it.quantity}</span>
                  <button onClick={() => update(it.id, Math.min(it.stock, it.quantity + 1))} className="grid h-9 w-9 place-items-center" aria-label="Sumar">
                    <Plus size={14} />
                  </button>
                </div>
                <button onClick={() => remove(it.id)} className="text-sm text-ink/60 hover:text-ink">
                  <span className="inline-flex items-center gap-1"><Trash size={14} /> Eliminar</span>
                </button>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-bold">{formatPrice(it.lineTotal)}</div>
              {it.quantity > 1 && (
                <div className="text-xs text-ink/55">{formatPrice(it.unit)} c/u</div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <aside className="self-start rounded-2xl border border-ink/10 p-6">
        <h2 className="text-lg font-extrabold uppercase tracking-wider">Resumen</h2>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/60">Subtotal</span>
            <span className="font-semibold">{formatPrice(cart.subtotal)}</span>
          </div>
          {cart.discount > 0 && (
            <div className="flex justify-between text-smurf-500">
              <span>Descuento ({cart.couponCode})</span>
              <span className="font-semibold">-{formatPrice(cart.discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-ink/60">Envío</span>
            <span className="font-semibold">{cart.shipping === 0 ? "Gratis" : formatPrice(cart.shipping)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/60">IVA incluido</span>
            <span>{formatPrice(cart.tax)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-ink/10 pt-3 text-base font-extrabold">
            <span>Total</span>
            <span>{formatPrice(cart.total)}</span>
          </div>
        </div>
        <div className="mt-5">
          <label className="label-base">Código de descuento</label>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="input-base" placeholder="WELCOME10" />
            <button
              onClick={async () => {
                setErr(null);
                const r = await applyCoupon(code);
                if (!r.ok) setErr(r.message || "Cupón inválido");
                else setCode("");
              }}
              className="btn-secondary"
            >
              Aplicar
            </button>
          </div>
          {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
          {cart.couponCode && (
            <button onClick={clearCoupon} className="mt-2 text-xs text-ink/60 underline">
              Quitar cupón
            </button>
          )}
        </div>
        <div className="mt-5">
          <label className="label-base">Envío</label>
          <div className="space-y-2">
            {SHIPPING_OPTIONS.map((s) => (
              <label key={s.id} className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm ${cart.shippingId === s.id ? "border-smurf-500 bg-smurf-50" : "border-ink/10"}`}>
                <span>
                  <input
                    type="radio"
                    name="shipping"
                    className="mr-2"
                    checked={cart.shippingId === s.id}
                    onChange={async () => {
                      setShipping(s.id);
                      await refresh();
                    }}
                  />
                  {s.label}
                </span>
                <span className="font-semibold">{s.price === 0 ? "Gratis" : formatPrice(s.price)}</span>
              </label>
            ))}
          </div>
        </div>
        <Link href="/checkout" className="btn-primary mt-6 w-full">
          Proceder al pago
        </Link>
        <div className="mt-5 grid gap-2 text-xs text-ink/60">
          <div className="flex items-center gap-2"><Truck size={14} /> Envío gratis a partir de 50€</div>
          <div className="flex items-center gap-2"><Shield size={14} /> Pago 100% seguro · PCI DSS</div>
        </div>
      </aside>
    </div>
  );
}
