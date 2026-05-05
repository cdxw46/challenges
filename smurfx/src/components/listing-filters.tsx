"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Close, Plus, Minus } from "./icons";
import { BRAND } from "@/lib/brand";

const SIZES_SHOE = ["38", "39", "40", "41", "42", "43", "44", "45"];
const SIZES_APP = ["XS", "S", "M", "L", "XL"];
const COLORS = [
  { name: "Royal Smurf", hex: "#534AB7" },
  { name: "Lavender", hex: "#CECBF6" },
  { name: "Onyx", hex: "#0A0A0A" },
  { name: "Paper", hex: "#FFFFFF" },
  { name: "Volt", hex: "#D4F25A" },
  { name: "Cobalt", hex: "#1E3A8A" },
  { name: "Coral", hex: "#FF6F61" }
];

export function ListingFilters({ basePath }: { basePath: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);

  const update = useCallback(
    (key: string, value: string | null, multi = false) => {
      const next = new URLSearchParams(sp.toString());
      if (multi) {
        const all = next.getAll(key);
        if (value === null) next.delete(key);
        else if (all.includes(value)) {
          next.delete(key);
          all.filter((v) => v !== value).forEach((v) => next.append(key, v));
        } else next.append(key, value);
      } else {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      router.push(`${basePath}?${next.toString()}`);
    },
    [router, sp, basePath]
  );

  const activeChips = useMemo(() => {
    const chips: { key: string; value: string; label: string }[] = [];
    sp.forEach((v, k) => {
      if (["sort", "page"].includes(k)) return;
      chips.push({ key: k, value: v, label: `${k}: ${v}` });
    });
    return chips;
  }, [sp]);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
    const [openS, setO] = useState(true);
    return (
      <div className="border-b border-ink/10 py-4">
        <button onClick={() => setO((v) => !v)} className="flex w-full items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-ink/80">{title}</span>
          {openS ? <Minus size={14} /> : <Plus size={14} />}
        </button>
        {openS && <div className="mt-3">{children}</div>}
      </div>
    );
  };

  const filters = (
    <div className="space-y-1">
      <Section title="Línea">
        <ul className="space-y-1.5 text-sm">
          {BRAND.lines.map((l) => {
            const active = sp.get("line") === l.name;
            return (
              <li key={l.slug}>
                <button
                  onClick={() => update("line", active ? null : l.name)}
                  className={`flex w-full justify-between rounded px-2 py-1 text-left ${active ? "bg-smurf-50 text-smurf-700" : "hover:bg-ink/5"}`}
                >
                  <span>{l.name}</span>
                  <span className="text-ink/50">{l.motto}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Actividad">
        <ul className="space-y-1.5 text-sm capitalize">
          {BRAND.activities.map((a) => {
            const active = sp.get("activity") === a;
            return (
              <li key={a}>
                <button
                  onClick={() => update("activity", active ? null : a)}
                  className={`w-full rounded px-2 py-1 text-left ${active ? "bg-smurf-50 text-smurf-700" : "hover:bg-ink/5"}`}
                >
                  {a}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Talla">
        <div className="flex flex-wrap gap-1.5">
          {[...SIZES_SHOE, ...SIZES_APP].map((s) => {
            const active = sp.getAll("size").includes(s);
            return (
              <button
                key={s}
                onClick={() => update("size", s, true)}
                className={`grid h-9 min-w-[36px] place-items-center rounded-md border px-2 text-xs font-semibold ${active ? "border-smurf-500 bg-smurf-500 text-white" : "border-ink/15 hover:border-ink"}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Color">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => {
            const active = sp.getAll("color").includes(c.name);
            return (
              <button
                key={c.name}
                title={c.name}
                onClick={() => update("color", c.name, true)}
                className={`h-7 w-7 rounded-full border-2 ${active ? "border-smurf-500 ring-2 ring-smurf-500/30" : "border-ink/10"}`}
                style={{ background: c.hex }}
              />
            );
          })}
        </div>
      </Section>
      <Section title="Precio máx.">
        <input
          type="range"
          min={20}
          max={250}
          step={10}
          value={Number(sp.get("max")) || 250}
          onChange={(e) => update("max", e.target.value)}
          className="w-full"
        />
        <div className="text-xs text-ink/60">Hasta {Number(sp.get("max")) || 250}€</div>
      </Section>
      <Section title="Otros">
        <ul className="space-y-1.5 text-sm">
          <li>
            <button
              onClick={() => update("new", sp.get("new") ? null : "1")}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${sp.get("new") ? "bg-smurf-50 text-smurf-700" : "hover:bg-ink/5"}`}
            >
              <input type="checkbox" readOnly checked={!!sp.get("new")} />
              Solo novedades
            </button>
          </li>
          <li>
            <button
              onClick={() => update("sale", sp.get("sale") ? null : "1")}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${sp.get("sale") ? "bg-smurf-50 text-smurf-700" : "hover:bg-ink/5"}`}
            >
              <input type="checkbox" readOnly checked={!!sp.get("sale")} />
              Solo en sale
            </button>
          </li>
        </ul>
      </Section>
    </div>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={() => setOpen(true)} className="btn-secondary md:hidden">
          Filtros
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((c) => (
            <button
              key={`${c.key}=${c.value}`}
              onClick={() => update(c.key, c.value, ["size", "color"].includes(c.key))}
              className="chip"
            >
              {c.label} <Close size={12} />
            </button>
          ))}
        </div>
        <select
          value={sp.get("sort") || "relevance"}
          onChange={(e) => update("sort", e.target.value)}
          className="rounded-full border border-ink/15 bg-white px-3 py-2 text-sm"
        >
          <option value="relevance">Relevancia</option>
          <option value="new">Más nuevo</option>
          <option value="price_asc">Precio ↑</option>
          <option value="price_desc">Precio ↓</option>
          <option value="rating">Más valorados</option>
        </select>
      </div>

      <aside className="hidden md:block">{filters}</aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-extrabold uppercase">Filtros</h3>
              <button onClick={() => setOpen(false)} aria-label="Cerrar">
                <Close />
              </button>
            </div>
            {filters}
            <button onClick={() => setOpen(false)} className="btn-primary mt-6 w-full">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
