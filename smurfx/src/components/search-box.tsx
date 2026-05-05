"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Close, Search as SearchIcon } from "./icons";
import { formatPrice } from "@/lib/format";

type Sug = {
  products: { id: string; slug: string; name: string; image: string | null; price: number }[];
  categories: { name: string; slug: string }[];
  popular: string[];
};

const POPULAR = ["smurfair", "running", "trail", "smurfforce", "sale"];

export function SearchBox({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<Sug | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    try {
      setHistory(JSON.parse(localStorage.getItem("smurfx_search_history") || "[]"));
    } catch {}
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, {
        signal: ctrl.signal,
        cache: "no-store"
      });
      if (r.ok) setData(await r.json());
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function commit(value: string) {
    if (!value.trim()) return;
    const next = [value, ...history.filter((h) => h !== value)].slice(0, 8);
    setHistory(next);
    localStorage.setItem("smurfx_search_history", JSON.stringify(next));
    location.href = `/buscar?q=${encodeURIComponent(value)}`;
  }

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-0 bg-white shadow-2xl">
        <div className="container-x flex items-center gap-3 py-4">
          <SearchIcon />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit(q)}
            placeholder="Buscar productos, líneas, categorías..."
            className="w-full bg-transparent py-2 text-lg outline-none placeholder:text-ink/40"
          />
          <button onClick={onClose} aria-label="Cerrar" className="btn-ghost">
            <Close />
          </button>
        </div>
        <div className="container-x grid grid-cols-1 gap-8 pb-10 md:grid-cols-3">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-ink/60">Búsquedas populares</div>
            <ul className="space-y-1 text-sm">
              {POPULAR.map((p) => (
                <li key={p}>
                  <button onClick={() => commit(p)} className="hover:text-smurf-500">
                    {p}
                  </button>
                </li>
              ))}
            </ul>
            {history.length > 0 && (
              <>
                <div className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-ink/60">Recientes</div>
                <ul className="space-y-1 text-sm">
                  {history.map((p) => (
                    <li key={p}>
                      <button onClick={() => commit(p)} className="hover:text-smurf-500">
                        {p}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="md:col-span-2">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-ink/60">Sugerencias</div>
            {!data && q.trim().length < 2 && (
              <div className="text-sm text-ink/50">Escribe al menos 2 letras…</div>
            )}
            {data && data.products.length === 0 && (
              <div className="text-sm text-ink/50">Sin resultados para “{q}”.</div>
            )}
            <ul className="grid grid-cols-2 gap-3">
              {data?.products.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/producto/${p.slug}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-xl border border-ink/5 bg-white p-2 hover:border-smurf-500/50"
                  >
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt={p.name} className="h-14 w-14 rounded-md object-cover" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-semibold leading-tight">{p.name}</div>
                      <div className="text-xs text-ink/60">{formatPrice(p.price)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
