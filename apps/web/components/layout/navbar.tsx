"use client";

import Link from "next/link";
import { Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type MenuItem = {
  label: string;
  href: string;
  group: string;
};

type NavbarProps = {
  items: MenuItem[];
  cartCount?: number;
  wishlistCount?: number;
};

const popularSearches = [
  "SmurfAir",
  "SmurfTrail",
  "hoodie",
  "running",
  "blue motion",
];

export function Navbar({
  items,
  cartCount = 0,
  wishlistCount = 0,
}: NavbarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(popularSearches);

  const groups = useMemo(() => {
    return items.reduce<Record<string, MenuItem[]>>((acc, item) => {
      acc[item.group] ??= [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, [items]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions(popularSearches);
      return;
    }

    const next = popularSearches.filter((entry) =>
      entry.toLowerCase().includes(query.toLowerCase()),
    );
    setSuggestions(next.length ? next : [`Buscar "${query}"`]);
  }, [query]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/85 backdrop-blur-lg">
      <div className="layout flex items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-white lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Abrir menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Link href="/" className="flex items-center text-2xl font-black tracking-[0.3em] text-white">
            SMURF<span className="text-brand-500">X</span>
          </Link>
        </div>

        <nav className="hidden items-center gap-8 lg:flex">
          {(groups.shop ?? []).map((item) => (
            <Link key={item.href} href={item.href} className="text-sm font-semibold uppercase tracking-[0.2em] text-white/82 transition hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden max-w-md flex-1 items-center justify-end gap-4 lg:flex">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto, linea o categoria"
              className="w-full rounded-full border border-white/10 bg-white/10 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/40"
              aria-label="Buscar"
            />
            <div className="absolute left-0 right-0 top-[calc(100%+0.6rem)] overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/98 shadow-2xl">
              {suggestions.slice(0, 5).map((suggestion) => (
                <Link
                  key={suggestion}
                  href={`/buscar?q=${encodeURIComponent(suggestion.replace(/^Buscar "/, "").replace(/"$/, ""))}`}
                  className="block border-b border-white/5 px-4 py-3 text-sm text-white/75 transition last:border-b-0 hover:bg-white/5 hover:text-white"
                >
                  {suggestion}
                </Link>
              ))}
            </div>
          </div>

          <Link href="/cuenta" className="icon-badge" aria-label="Cuenta">
            <User size={18} />
          </Link>
          <Link href="/cuenta?tab=favoritos" className="icon-badge" aria-label="Favoritos">
            <Heart size={18} />
            {wishlistCount > 0 ? <span className="icon-pill">{wishlistCount}</span> : null}
          </Link>
          <Link href="/carrito" className="icon-badge" aria-label="Carrito">
            <ShoppingBag size={18} />
            {cartCount > 0 ? <span className="icon-pill">{cartCount}</span> : null}
          </Link>
        </div>
      </div>

      <div
        className={cn(
          "border-t border-white/10 bg-zinc-950 lg:hidden",
          open ? "block" : "hidden",
        )}
      >
        <div className="layout flex flex-col gap-5 py-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
              className="w-full rounded-full border border-white/10 bg-white/8 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/40"
              aria-label="Buscar movil"
            />
          </div>
          <div className="grid gap-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/cuenta" className="icon-badge">
              <User size={18} />
            </Link>
            <Link href="/cuenta?tab=favoritos" className="icon-badge">
              <Heart size={18} />
              {wishlistCount > 0 ? <span className="icon-pill">{wishlistCount}</span> : null}
            </Link>
            <Link href="/carrito" className="icon-badge">
              <ShoppingBag size={18} />
              {cartCount > 0 ? <span className="icon-pill">{cartCount}</span> : null}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
