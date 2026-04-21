"use client";

import Link from "next/link";
import { useCartStore } from "@/store/cartStore";
import { useEffect, useState } from "react";

export default function Header() {
  const itemCount = useCartStore((state) => state.itemCount());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="bg-black text-white text-xs text-center py-2 font-medium tracking-wide">
        ENVÍO GRATIS PARA MIEMBROS SMURFX | DEVOLUCIONES GRATUITAS
      </div>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-2xl font-bold tracking-tighter text-primary">
            SMURFX<span className="text-primary"></span>
          </Link>
          <nav className="hidden md:flex gap-6 text-sm font-medium">
            <Link href="/hombre" className="hover:text-primary transition-colors">Hombre</Link>
            <Link href="/mujer" className="hover:text-primary transition-colors">Mujer</Link>
            <Link href="/ninos" className="hover:text-primary transition-colors">Niños</Link>
            <Link href="/sale" className="text-red-600 hover:text-red-700 transition-colors">Sale</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex relative">
            <input 
              type="search" 
              placeholder="Buscar..." 
              className="pl-10 pr-4 py-2 rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-64 transition-all"
            />
            <svg className="w-5 h-5 absolute left-3 top-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
            </svg>
          </button>
          <Link href="/carrito" className="p-2 hover:bg-gray-100 rounded-full transition-colors relative">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
            </svg>
            {mounted && itemCount > 0 && (
              <span className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
