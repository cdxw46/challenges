"use client";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "./cart-provider";
import { formatPrice } from "@/lib/format";
import { SHIPPING_OPTIONS } from "@/lib/shipping";
import { Check } from "./icons";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe
} from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";

type Address = {
  firstName: string;
  lastName: string;
  addressLine: string;
  addressLine2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone?: string;
};

const EMPTY: Address = {
  firstName: "",
  lastName: "",
  addressLine: "",
  city: "",
  region: "",
  postalCode: "",
  country: "ES",
  phone: ""
};

export function CheckoutFlow({ stripePk }: { stripePk: string }) {
  const { cart, refresh } = useCart();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<Address>(EMPTY);
  const [shippingId, setShippingId] = useState("standard");
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "manual" | "paypal" | "klarna" | "bizum">("stripe");
  const [stripeData, setStripeData] = useState<{
    clientSecret: string;
    publishableKey: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.user) {
          setEmail(j.user.email);
          setAddress((a) => ({
            ...a,
            firstName: j.user.firstName,
            lastName: j.user.lastName
          }));
        }
      })
      .catch(() => {});
  }, []);

  const valid1 = email && /\S+@\S+\.\S+/.test(email);
  const valid2 =
    address.firstName && address.lastName && address.addressLine && address.city && address.region && address.postalCode;

  async function startPayment() {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          shippingId,
          shippingAddress: address,
          paymentMethod
        })
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "No se pudo iniciar el pago");
        setLoading(false);
        return;
      }
      if (paymentMethod === "stripe") {
        setStripeData({ clientSecret: j.clientSecret, publishableKey: j.publishableKey });
      } else {
        location.href = `/cuenta/pedidos/${j.orderNumber}`;
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <Steps step={step} />

        {step === 1 && (
          <section className="mt-8 space-y-4">
            <h2 className="text-lg font-extrabold uppercase tracking-wider">1. Contacto</h2>
            <div>
              <label className="label-base">Email</label>
              <input className="input-base" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <h2 className="pt-3 text-lg font-extrabold uppercase tracking-wider">Dirección de envío</h2>
            <AddressForm value={address} onChange={setAddress} />
            <button
              disabled={!valid1 || !valid2}
              onClick={() => setStep(2)}
              className="btn-primary disabled:opacity-50"
            >
              Continuar al envío
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="mt-8 space-y-4">
            <h2 className="text-lg font-extrabold uppercase tracking-wider">2. Envío</h2>
            <div className="space-y-2">
              {SHIPPING_OPTIONS.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 ${shippingId === s.id ? "border-smurf-500 bg-smurf-50" : "border-ink/10"}`}
                >
                  <div>
                    <input
                      type="radio"
                      name="ship"
                      checked={shippingId === s.id}
                      onChange={async () => {
                        setShippingId(s.id);
                        await refresh();
                      }}
                      className="mr-3"
                    />
                    <span className="font-semibold">{s.label}</span>
                    <span className="ml-2 text-xs text-ink/60">{s.eta}</span>
                  </div>
                  <span className="font-semibold">{s.price === 0 ? "Gratis" : formatPrice(s.price)}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn-secondary">
                Atrás
              </button>
              <button onClick={() => setStep(3)} className="btn-primary">
                Continuar al pago
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="mt-8 space-y-4">
            <h2 className="text-lg font-extrabold uppercase tracking-wider">3. Pago</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {[
                { id: "stripe", label: "Tarjeta (Stripe)", note: "VISA · MasterCard · AMEX · Apple/Google Pay" },
                { id: "paypal", label: "PayPal", note: "Pago con tu cuenta PayPal" },
                { id: "klarna", label: "Klarna", note: "Paga en 3 cuotas sin intereses" },
                { id: "bizum", label: "Bizum", note: "Pago instantáneo (España)" }
              ].map((m) => (
                <label
                  key={m.id}
                  className={`cursor-pointer rounded-xl border p-4 ${paymentMethod === m.id ? "border-smurf-500 bg-smurf-50" : "border-ink/10"}`}
                >
                  <input
                    type="radio"
                    name="pay"
                    checked={paymentMethod === m.id}
                    onChange={() => setPaymentMethod(m.id as any)}
                    className="mr-2"
                  />
                  <span className="font-semibold">{m.label}</span>
                  <div className="ml-6 text-xs text-ink/60">{m.note}</div>
                </label>
              ))}
            </div>

            {paymentMethod !== "stripe" && (
              <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                Se procesará como pago manual y recibirás instrucciones por email. Activa el proveedor en el panel de
                administración para automatizarlo.
              </div>
            )}

            {!stripeData && (
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="btn-secondary">
                  Atrás
                </button>
                <button onClick={startPayment} disabled={loading} className="btn-primary disabled:opacity-50">
                  {loading ? "Preparando..." : "Continuar"}
                </button>
              </div>
            )}
            {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}

            {stripeData && (
              <StripePaymentForm
                pk={stripeData.publishableKey}
                clientSecret={stripeData.clientSecret}
                email={email}
                shippingId={shippingId}
                shippingAddress={address}
              />
            )}
          </section>
        )}
      </div>

      <aside className="self-start rounded-2xl border border-ink/10 p-6">
        <h2 className="text-lg font-extrabold uppercase tracking-wider">Tu pedido</h2>
        <ul className="mt-4 divide-y divide-ink/10">
          {cart.items.map((it) => (
            <li key={it.id} className="flex gap-3 py-3">
              <div className="h-16 w-16 overflow-hidden rounded-md bg-smurf-50">
                {it.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt={it.name} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex-1 text-sm">
                <div className="font-semibold leading-tight">{it.name}</div>
                <div className="text-xs text-ink/60">
                  {it.quantity}× · {it.color} · {it.size}
                </div>
              </div>
              <div className="text-sm font-semibold">{formatPrice(it.lineTotal)}</div>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1 border-t border-ink/10 pt-4 text-sm">
          <div className="flex justify-between"><span className="text-ink/60">Subtotal</span><span>{formatPrice(cart.subtotal)}</span></div>
          {cart.discount > 0 && (
            <div className="flex justify-between text-smurf-500"><span>Descuento</span><span>-{formatPrice(cart.discount)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-ink/60">Envío</span><span>{cart.shipping === 0 ? "Gratis" : formatPrice(cart.shipping)}</span></div>
          <div className="flex justify-between"><span className="text-ink/60">IVA incluido</span><span>{formatPrice(cart.tax)}</span></div>
          <div className="mt-2 flex justify-between border-t border-ink/10 pt-2 text-base font-extrabold">
            <span>Total</span><span>{formatPrice(cart.total)}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-ink/60">
      {["Contacto", "Envío", "Pago"].map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] ${step > i ? "bg-smurf-500 text-white" : "bg-ink/10"}`}>
            {step > i + 1 ? <Check size={14} /> : i + 1}
          </span>
          <span className={step === i + 1 ? "text-ink" : ""}>{s}</span>
          {i < 2 && <span className="mx-2">›</span>}
        </li>
      ))}
    </ol>
  );
}

function AddressForm({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label-base">Nombre</label>
        <input className="input-base" value={value.firstName} onChange={set("firstName")} />
      </div>
      <div>
        <label className="label-base">Apellidos</label>
        <input className="input-base" value={value.lastName} onChange={set("lastName")} />
      </div>
      <div className="col-span-2">
        <label className="label-base">Dirección</label>
        <input className="input-base" value={value.addressLine} onChange={set("addressLine")} />
      </div>
      <div className="col-span-2">
        <label className="label-base">Piso / puerta (opcional)</label>
        <input className="input-base" value={value.addressLine2 || ""} onChange={set("addressLine2")} />
      </div>
      <div>
        <label className="label-base">Ciudad</label>
        <input className="input-base" value={value.city} onChange={set("city")} />
      </div>
      <div>
        <label className="label-base">Provincia</label>
        <input className="input-base" value={value.region} onChange={set("region")} />
      </div>
      <div>
        <label className="label-base">Código postal</label>
        <input className="input-base" value={value.postalCode} onChange={set("postalCode")} />
      </div>
      <div>
        <label className="label-base">País</label>
        <select
          className="input-base"
          value={value.country}
          onChange={(e) => onChange({ ...value, country: e.target.value })}
        >
          <option value="ES">España</option>
          <option value="PT">Portugal</option>
          <option value="FR">Francia</option>
          <option value="IT">Italia</option>
          <option value="DE">Alemania</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="label-base">Teléfono</label>
        <input className="input-base" value={value.phone || ""} onChange={set("phone")} />
      </div>
    </div>
  );
}

function StripePaymentForm({
  pk,
  clientSecret,
  email,
  shippingId,
  shippingAddress
}: {
  pk: string;
  clientSecret: string;
  email: string;
  shippingId: string;
  shippingAddress: any;
}) {
  const stripe = useMemo<Promise<Stripe | null>>(() => loadStripe(pk), [pk]);
  return (
    <Elements stripe={stripe} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <StripeInner
        clientSecret={clientSecret}
        email={email}
        shippingId={shippingId}
        shippingAddress={shippingAddress}
      />
    </Elements>
  );
}

function StripeInner({
  clientSecret,
  email,
  shippingId,
  shippingAddress
}: {
  clientSecret: string;
  email: string;
  shippingId: string;
  shippingAddress: any;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { receipt_email: email, return_url: `${location.origin}/checkout/confirmacion` }
    });
    if (error) {
      setErr(error.message ?? "Error en el pago");
      setBusy(false);
      return;
    }
    if (paymentIntent?.status === "succeeded") {
      const r = await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          email,
          shippingId,
          shippingAddress
        })
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "No se pudo confirmar");
        setBusy(false);
        return;
      }
      router.push(`/checkout/confirmacion?n=${j.orderNumber}`);
    } else {
      setErr(`Estado del pago: ${paymentIntent?.status}`);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <button onClick={pay} disabled={busy || !stripe} className="btn-primary w-full">
        {busy ? "Procesando..." : "Pagar"}
      </button>
    </div>
  );
}
