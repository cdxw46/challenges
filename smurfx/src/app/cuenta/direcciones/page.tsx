"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/account/dashboard";

type Addr = {
  id: string;
  firstName: string;
  lastName: string;
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone?: string | null;
  isDefault: boolean;
};

export default function Page() {
  const [list, setList] = useState<Addr[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    addressLine: "",
    city: "",
    region: "",
    postalCode: "",
    country: "ES",
    phone: ""
  });
  async function load() {
    const r = await fetch("/api/account/addresses", { cache: "no-store" });
    if (r.ok) setList((await r.json()).addresses);
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="container-x grid gap-8 py-10 md:grid-cols-[260px_1fr]">
      <Sidebar />
      <div>
        <div className="flex items-center justify-between">
          <h1 className="h-display text-3xl">Mis direcciones</h1>
          <button onClick={() => setOpen((v) => !v)} className="btn-secondary">
            {open ? "Cancelar" : "Añadir dirección"}
          </button>
        </div>

        {open && (
          <form
            className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-ink/10 p-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await fetch("/api/account/addresses", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(form)
              });
              if (r.ok) {
                setOpen(false);
                load();
              }
            }}
          >
            {(
              ["firstName", "lastName", "addressLine", "city", "region", "postalCode", "country", "phone"] as const
            ).map((k) => (
              <div key={k} className={k === "addressLine" ? "col-span-2" : ""}>
                <label className="label-base">{k}</label>
                <input
                  className="input-base"
                  value={(form as any)[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  required={!["phone"].includes(k)}
                />
              </div>
            ))}
            <div className="col-span-2">
              <button className="btn-primary">Guardar</button>
            </div>
          </form>
        )}

        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {list.map((a) => (
            <li key={a.id} className="rounded-2xl border border-ink/10 p-4 text-sm">
              <div className="font-bold">{a.firstName} {a.lastName}</div>
              <div>{a.addressLine}</div>
              <div>{a.postalCode} {a.city}, {a.region}</div>
              <div>{a.country}</div>
              <div className="mt-3 flex gap-2 text-xs">
                <button
                  onClick={async () => {
                    await fetch(`/api/account/addresses?id=${a.id}`, { method: "DELETE" });
                    load();
                  }}
                  className="text-red-600 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
          {list.length === 0 && (
            <li className="rounded-2xl border border-ink/10 p-6 text-sm text-ink/60">
              No tienes direcciones guardadas.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
