"use client";
import { useState } from "react";

export default function Page() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="container-x grid place-items-center py-16">
      <div className="w-full max-w-md rounded-3xl border border-ink/10 p-8">
        <h1 className="h-display text-3xl">Recuperar contraseña</h1>
        {!sent ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await fetch("/api/auth/forgot", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email })
              });
              setSent(true);
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label className="label-base">Email</label>
              <input className="input-base" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn-primary w-full">Enviar enlace</button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-ink/70">
            Si el email existe en nuestro sistema, enviaremos un enlace de recuperación. Revisa tu bandeja en unos
            minutos.
          </p>
        )}
      </div>
    </div>
  );
}
