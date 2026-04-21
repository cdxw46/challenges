"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/account/dashboard";

export default function Page() {
  const [profile, setProfile] = useState({ firstName: "", lastName: "", phone: "", savedSize: "" });
  const [pwForm, setPw] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.user) setProfile({ firstName: j.user.firstName, lastName: j.user.lastName, phone: "", savedSize: j.user.savedSize || "" });
      });
  }, []);
  return (
    <div className="container-x grid gap-8 py-10 md:grid-cols-[260px_1fr]">
      <Sidebar />
      <div>
        <h1 className="h-display text-3xl">Mis datos</h1>
        <form
          className="mt-6 grid gap-4 rounded-2xl border border-ink/10 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await fetch("/api/account/profile", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(profile)
            });
            setMsg(r.ok ? "Datos actualizados" : "Error");
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-base">Nombre</label>
              <input className="input-base" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
            </div>
            <div>
              <label className="label-base">Apellidos</label>
              <input className="input-base" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
            </div>
            <div>
              <label className="label-base">Teléfono</label>
              <input className="input-base" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </div>
            <div>
              <label className="label-base">Talla preferida</label>
              <input className="input-base" value={profile.savedSize} onChange={(e) => setProfile({ ...profile, savedSize: e.target.value })} />
            </div>
          </div>
          <button className="btn-primary self-start">Guardar</button>
        </form>

        <form
          className="mt-6 grid gap-4 rounded-2xl border border-ink/10 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await fetch("/api/account/profile", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(pwForm)
            });
            setMsg(r.ok ? "Contraseña actualizada" : (await r.json()).error || "Error");
          }}
        >
          <h2 className="text-lg font-extrabold uppercase tracking-wider">Cambiar contraseña</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-base">Actual</label>
              <input className="input-base" type="password" value={pwForm.current} onChange={(e) => setPw({ ...pwForm, current: e.target.value })} />
            </div>
            <div>
              <label className="label-base">Nueva</label>
              <input className="input-base" type="password" minLength={8} value={pwForm.next} onChange={(e) => setPw({ ...pwForm, next: e.target.value })} />
            </div>
          </div>
          <button className="btn-secondary self-start">Cambiar</button>
        </form>

        {msg && <div className="mt-4 text-sm text-smurf-700">{msg}</div>}
      </div>
    </div>
  );
}
