"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./logo";
import { Search, Heart, Bag, User, Menu, Close, Chevron } from "./icons";
import { useCart } from "./cart-provider";
import { CartDrawer } from "./cart-drawer";
import { SearchBox } from "./search-box";
import clsx from "clsx";

const NAV: { label: string; href: string; mega?: { title: string; links: { label: string; href: string }[] }[] }[] = [
  {
    label: "Hombre",
    href: "/hombre",
    mega: [
      {
        title: "Calzado",
        links: [
          { label: "Running", href: "/hombre?activity=running" },
          { label: "Training", href: "/hombre?activity=training" },
          { label: "Lifestyle", href: "/hombre?activity=lifestyle" },
          { label: "Trail", href: "/hombre?activity=trail" },
          { label: "Basketball", href: "/hombre?activity=basketball" }
        ]
      },
      {
        title: "Líneas",
        links: [
          { label: "SmurfAir", href: "/hombre?line=SmurfAir" },
          { label: "SmurfForce", href: "/hombre?line=SmurfForce" },
          { label: "SmurfRun", href: "/hombre?line=SmurfRun" },
          { label: "SmurfGlide", href: "/hombre?line=SmurfGlide" },
          { label: "SmurfTrail", href: "/hombre?line=SmurfTrail" }
        ]
      },
      {
        title: "Destacado",
        links: [
          { label: "Nuevos lanzamientos", href: "/hombre?sort=new" },
          { label: "Más vendidos", href: "/hombre?sort=top" },
          { label: "Sale", href: "/sale" }
        ]
      }
    ]
  },
  {
    label: "Mujer",
    href: "/mujer",
    mega: [
      {
        title: "Calzado",
        links: [
          { label: "Running", href: "/mujer?activity=running" },
          { label: "Training", href: "/mujer?activity=training" },
          { label: "Lifestyle", href: "/mujer?activity=lifestyle" },
          { label: "Trail", href: "/mujer?activity=trail" }
        ]
      },
      {
        title: "Líneas",
        links: [
          { label: "SmurfAir", href: "/mujer?line=SmurfAir" },
          { label: "SmurfRun", href: "/mujer?line=SmurfRun" },
          { label: "SmurfGlide", href: "/mujer?line=SmurfGlide" }
        ]
      }
    ]
  },
  { label: "Niños", href: "/ninos" },
  { label: "Sale", href: "/sale" },
  {
    label: "Colecciones",
    href: "/coleccion/blue-revolution",
    mega: [
      {
        title: "Colecciones",
        links: [
          { label: "Blue Revolution", href: "/coleccion/blue-revolution" },
          { label: "Ultra Glide", href: "/coleccion/ultra-glide" },
          { label: "Court Classics", href: "/coleccion/court-classics" }
        ]
      }
    ]
  }
];

export function Navbar() {
  const { cart, setDrawerOpen, drawerOpen } = useCart();
  const [hover, setHover] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={clsx(
          "sticky top-0 z-30 border-b border-ink/5 bg-white/95 backdrop-blur transition",
          scrolled && "shadow-[0_1px_0_rgba(0,0,0,0.04)]"
        )}
      >
        <div className="container-x flex h-16 items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu />
            </button>
            <Logo />
          </div>

          <nav
            className="hidden flex-1 items-center justify-center gap-8 md:flex"
            onMouseLeave={() => {
              if (closeTimer.current) clearTimeout(closeTimer.current);
              closeTimer.current = setTimeout(() => setHover(null), 120);
            }}
          >
            {NAV.map((item, i) => (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => {
                  if (closeTimer.current) clearTimeout(closeTimer.current);
                  setHover(i);
                }}
              >
                <Link
                  href={item.href}
                  className="text-sm font-semibold uppercase tracking-wider text-ink/85 transition hover:text-smurf-500"
                >
                  {item.label}
                </Link>
              </div>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <button
              aria-label="Buscar"
              className="btn-ghost"
              onClick={() => setSearchOpen((v) => !v)}
            >
              <Search />
            </button>
            <Link href="/cuenta/favoritos" className="btn-ghost" aria-label="Favoritos">
              <Heart />
            </Link>
            <Link href="/cuenta" className="btn-ghost" aria-label="Mi cuenta">
              <User />
            </Link>
            <button
              className="btn-ghost relative"
              aria-label="Carrito"
              onClick={() => setDrawerOpen(true)}
            >
              <Bag />
              {cart.itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-smurf-500 px-1 text-[10px] font-bold text-white">
                  {cart.itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {hover !== null && NAV[hover]?.mega && (
          <div
            className="absolute inset-x-0 top-full z-20 hidden border-t border-ink/5 bg-white shadow-xl md:block"
            onMouseEnter={() => {
              if (closeTimer.current) clearTimeout(closeTimer.current);
            }}
            onMouseLeave={() => setHover(null)}
          >
            <div className="container-x grid grid-cols-4 gap-10 py-10">
              {NAV[hover].mega!.map((col) => (
                <div key={col.title}>
                  <div className="mb-4 text-xs font-bold uppercase tracking-widest text-ink/60">
                    {col.title}
                  </div>
                  <ul className="space-y-3">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <Link
                          href={l.href}
                          className="text-sm font-semibold text-ink/85 hover:text-smurf-500"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div
                className="hidden rounded-2xl bg-gradient-to-br from-smurf-500 to-smurf-700 p-6 text-white lg:block"
                style={{ minHeight: 220 }}
              >
                <div className="text-xs font-semibold uppercase tracking-widest text-smurf-100/90">
                  Nuevo
                </div>
                <div className="mt-2 text-2xl font-extrabold leading-tight">Blue Revolution SS25</div>
                <p className="mt-2 text-sm text-white/80">
                  Una nueva forma de moverse. Líneas limpias, color profundo.
                </p>
                <Link
                  href="/coleccion/blue-revolution"
                  className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-smurf-700"
                >
                  Descubrir
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {searchOpen && <SearchBox onClose={() => setSearchOpen(false)} />}
      {drawerOpen && <CartDrawer />}

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={() => setMobileOpen(false)} aria-label="Cerrar">
                <Close />
              </button>
            </div>
            <nav className="mt-8 space-y-3">
              {NAV.map((n) => (
                <div key={n.label}>
                  <Link
                    href={n.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between border-b border-ink/10 py-3 text-base font-bold uppercase tracking-wider"
                  >
                    {n.label}
                    <Chevron />
                  </Link>
                </div>
              ))}
            </nav>
            <div className="mt-8 space-y-2">
              <Link href="/cuenta" className="btn-secondary w-full" onClick={() => setMobileOpen(false)}>
                Mi cuenta
              </Link>
              <Link href="/cuenta/favoritos" className="btn-ghost w-full" onClick={() => setMobileOpen(false)}>
                Favoritos
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
