"use client";
import Link from "next/link";
import { useCart } from "./cart-provider";
import { Close, Trash, Plus, Minus } from "./icons";
import { formatPrice } from "@/lib/format";

export function CartDrawer() {
  const { cart, setDrawerOpen, update, remove } = useCart();
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-ink/10 px-6 py-5">
          <h2 className="text-lg font-extrabold uppercase tracking-wider">Tu carrito</h2>
          <button onClick={() => setDrawerOpen(false)} aria-label="Cerrar">
            <Close />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {cart.items.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-sm text-ink/60">
              <div>
                <div className="text-4xl">🛍️</div>
                <p className="mt-3">Tu carrito está vacío.</p>
                <Link href="/hombre" onClick={() => setDrawerOpen(false)} className="btn-primary mt-4">
                  Ver productos
                </Link>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-ink/10">
              {cart.items.map((it) => (
                <li key={it.id} className="flex gap-3 py-4">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-smurf-50">
                    {it.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt={it.name} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/producto/${it.slug}`}
                        onClick={() => setDrawerOpen(false)}
                        className="text-sm font-bold leading-tight"
                      >
                        {it.name}
                      </Link>
                      <button onClick={() => remove(it.id)} className="text-ink/50 hover:text-ink" aria-label="Eliminar">
                        <Trash size={16} />
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-ink/60">
                      Talla {it.size} · {it.color}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-full border border-ink/10">
                        <button
                          className="grid h-7 w-7 place-items-center"
                          onClick={() => update(it.id, Math.max(1, it.quantity - 1))}
                          aria-label="Restar"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{it.quantity}</span>
                        <button
                          className="grid h-7 w-7 place-items-center"
                          onClick={() => update(it.id, Math.min(it.stock, it.quantity + 1))}
                          aria-label="Sumar"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="text-sm font-bold">{formatPrice(it.lineTotal)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {cart.items.length > 0 && (
          <footer className="border-t border-ink/10 px-6 py-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">Subtotal</span>
              <span className="font-semibold">{formatPrice(cart.subtotal)}</span>
            </div>
            {cart.discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/60">Descuento</span>
                <span className="font-semibold text-smurf-500">-{formatPrice(cart.discount)}</span>
              </div>
            )}
            <div className="mt-1 text-xs text-ink/50">Envío e impuestos calculados al finalizar.</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/carrito" onClick={() => setDrawerOpen(false)} className="btn-secondary">
                Ver carrito
              </Link>
              <Link href="/checkout" onClick={() => setDrawerOpen(false)} className="btn-primary">
                Pagar
              </Link>
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
}
