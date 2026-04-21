"use client";
import { useState } from "react";
import Link from "next/link";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: pw })
    });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) {
      setErr(j.error || "Error");
      return;
    }
    location.href = next;
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <label className="label-base">Email</label>
        <input className="input-base" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      </div>
      <div>
        <label className="label-base">Contraseña</label>
        <input className="input-base" value={pw} onChange={(e) => setPw(e.target.value)} type="password" required />
      </div>
      {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <button disabled={loading} className="btn-primary w-full">
        {loading ? "Entrando..." : "Entrar"}
      </button>
      <div className="flex justify-between text-xs text-ink/60">
        <Link href="/cuenta/forgot" className="hover:text-ink">Olvidé mi contraseña</Link>
        <Link href="/cuenta/registro" className="hover:text-ink">Crear cuenta</Link>
      </div>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const [data, setData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    birthDate: "",
    acceptTerms: false
  });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...data, birthDate: data.birthDate || undefined })
    });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) {
      setErr(j.error || "Error");
      return;
    }
    location.href = next;
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-base">Nombre</label>
          <input className="input-base" required value={data.firstName} onChange={(e) => setData({ ...data, firstName: e.target.value })} />
        </div>
        <div>
          <label className="label-base">Apellidos</label>
          <input className="input-base" required value={data.lastName} onChange={(e) => setData({ ...data, lastName: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label-base">Email</label>
        <input className="input-base" type="email" required value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} />
      </div>
      <div>
        <label className="label-base">Contraseña</label>
        <input className="input-base" type="password" required minLength={8} value={data.password} onChange={(e) => setData({ ...data, password: e.target.value })} />
        <div className="mt-1 text-xs text-ink/55">Al menos 8 caracteres.</div>
      </div>
      <div>
        <label className="label-base">Fecha de nacimiento (opcional)</label>
        <input className="input-base" type="date" value={data.birthDate} onChange={(e) => setData({ ...data, birthDate: e.target.value })} />
      </div>
      <label className="flex gap-2 text-xs text-ink/70">
        <input
          type="checkbox"
          required
          checked={data.acceptTerms}
          onChange={(e) => setData({ ...data, acceptTerms: e.target.checked })}
        />
        Acepto los <Link href="/terminos" className="text-smurf-600">términos</Link> y la{" "}
        <Link href="/privacidad" className="text-smurf-600">política de privacidad</Link>.
      </label>
      {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <button disabled={loading} className="btn-primary">
        {loading ? "Creando..." : "Crear cuenta"}
      </button>
      <div className="text-center text-xs text-ink/60">
        ¿Ya tienes cuenta?{" "}
        <Link href="/cuenta/login" className="text-smurf-600">Inicia sesión</Link>
      </div>
    </form>
  );
}
