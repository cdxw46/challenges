"use client";
import { useMemo, useState } from "react";
import { formatPrice, discountPct, effectivePrice } from "@/lib/format";
import { useCart } from "./cart-provider";
import { Heart, Star, Truck, Shield } from "./icons";
import { ProductCard } from "./product-card";

type Variant = { id: string; sku: string; size: string; color: string; colorHex: string; stock: number };
export type PDProduct = {
  id: string;
  slug: string;
  name: string;
  line: string;
  shortDesc: string;
  description: string;
  basePrice: number;
  salePrice: number | null;
  isNew: boolean;
  rating: number;
  ratingCount: number;
  images: { url: string; alt: string | null; color: string | null }[];
  variants: Variant[];
  colors: { color: string; colorHex: string }[];
  reviews: {
    id: string;
    rating: number;
    title: string | null;
    body: string;
    createdAt: string;
    authorName: string;
    verified: boolean;
  }[];
};

export function ProductDetail({
  product,
  related
}: {
  product: PDProduct;
  related: React.ComponentProps<typeof ProductCard>[];
}) {
  const { add } = useCart();
  const [color, setColor] = useState<string>(product.colors[0]?.color || "");
  const [size, setSize] = useState<string>("");
  const [tab, setTab] = useState<"desc" | "specs" | "care" | "ship">("desc");
  const [imgIdx, setImgIdx] = useState(0);
  const [zoom, setZoom] = useState(false);

  const filteredImages = useMemo(
    () => (product.images.filter((i) => !i.color || i.color === color).length
      ? product.images.filter((i) => !i.color || i.color === color)
      : product.images),
    [product.images, color]
  );
  const sizesForColor = useMemo(
    () => product.variants.filter((v) => v.color === color),
    [product.variants, color]
  );
  const selectedVariant = useMemo(
    () => sizesForColor.find((v) => v.size === size) ?? null,
    [sizesForColor, size]
  );

  const eff = effectivePrice(product.basePrice, product.salePrice);
  const off = discountPct(product.basePrice, product.salePrice);
  const inStock = selectedVariant ? selectedVariant.stock : sizesForColor.reduce((a, v) => a + v.stock, 0);

  const ratingDist = useMemo(() => {
    const dist = [0, 0, 0, 0, 0];
    product.reviews.forEach((r) => (dist[r.rating - 1] += 1));
    return dist.reverse();
  }, [product.reviews]);

  async function handleAdd(buyNow = false) {
    if (!selectedVariant) {
      alert("Selecciona una talla");
      return;
    }
    const ok = await add(selectedVariant.id);
    if (ok && buyNow) location.href = "/checkout";
  }

  return (
    <article className="container-x py-8">
      <nav className="mb-4 text-xs text-ink/60">
        <a href="/">Inicio</a> / <a href={`/${["unisex"].includes("hombre") ? "" : "hombre"}`}>Tienda</a> / {product.line} / {product.name}
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div
            onClick={() => setZoom(true)}
            className="relative aspect-[4/5] cursor-zoom-in overflow-hidden rounded-3xl bg-smurf-50"
          >
            {filteredImages[imgIdx] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={filteredImages[imgIdx].url}
                alt={filteredImages[imgIdx].alt ?? product.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {filteredImages.map((img, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                className={`aspect-square overflow-hidden rounded-lg border ${i === imgIdx ? "border-smurf-500 ring-2 ring-smurf-500/30" : "border-ink/10"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="text-xs font-bold uppercase tracking-widest text-smurf-500">{product.line}</div>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight md:text-4xl">{product.name}</h1>
          <p className="mt-1 text-sm text-ink/70">{product.shortDesc}</p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1 text-amber-500">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} size={14} fill={i < Math.round(product.rating) ? "currentColor" : "none"} />
              ))}
            </span>
            <span className="text-ink/60">
              {product.rating ? product.rating.toFixed(1) : "Nuevo"} ({product.ratingCount})
            </span>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <div className={`text-2xl font-extrabold ${off > 0 ? "text-smurf-500" : ""}`}>{formatPrice(eff)}</div>
            {off > 0 && (
              <>
                <div className="text-sm text-ink/45 line-through">{formatPrice(product.basePrice)}</div>
                <span className="rounded-full bg-smurf-50 px-2 py-0.5 text-xs font-bold text-smurf-700">-{off}%</span>
              </>
            )}
          </div>

          <div className="mt-7">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-ink/70">
              Color: <span className="text-ink">{color}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((c) => (
                <button
                  key={c.color}
                  onClick={() => {
                    setColor(c.color);
                    setSize("");
                    setImgIdx(0);
                  }}
                  className={`h-8 w-8 rounded-full border-2 ${c.color === color ? "border-smurf-500 ring-2 ring-smurf-500/30" : "border-ink/15"}`}
                  style={{ background: c.colorHex }}
                  title={c.color}
                  aria-label={`Color ${c.color}`}
                />
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-widest text-ink/70">
                Talla: <span className="text-ink">{size || "Selecciona"}</span>
              </div>
              <a href="/guia-de-tallas" className="text-xs font-semibold text-smurf-600 hover:text-smurf-700">
                Guía de tallas
              </a>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {sizesForColor.map((v) => {
                const out = v.stock <= 0;
                const active = v.size === size;
                return (
                  <button
                    key={v.id}
                    disabled={out}
                    onClick={() => setSize(v.size)}
                    className={`grid h-11 place-items-center rounded-md border text-sm font-semibold transition ${
                      active
                        ? "border-smurf-500 bg-smurf-500 text-white"
                        : out
                          ? "cursor-not-allowed border-ink/10 text-ink/30 line-through"
                          : "border-ink/15 hover:border-ink"
                    }`}
                  >
                    {v.size}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedVariant && selectedVariant.stock < 5 && selectedVariant.stock > 0 && (
            <div className="mt-3 text-xs font-semibold text-amber-600">
              Solo quedan {selectedVariant.stock} unidades
            </div>
          )}

          <div className="mt-6 grid gap-2">
            <button onClick={() => handleAdd(false)} className="btn-primary">
              Añadir al carrito
            </button>
            <button onClick={() => handleAdd(true)} className="btn-secondary">
              Comprar ahora
            </button>
            <button className="btn-ghost gap-2" aria-label="Favoritos">
              <Heart size={16} /> Añadir a favoritos
            </button>
          </div>

          <div className="mt-6 space-y-2 rounded-2xl border border-ink/10 p-4 text-sm">
            <div className="flex items-center gap-2">
              <Truck size={18} className="text-smurf-500" />
              Envío gratis a partir de 50€ — entrega en 3-5 días.
            </div>
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-smurf-500" />
              Devoluciones gratuitas en 30 días.
            </div>
          </div>

          <div className="mt-8">
            <div className="flex gap-4 border-b border-ink/10 text-sm">
              {[
                { k: "desc", l: "Descripción" },
                { k: "specs", l: "Características" },
                { k: "care", l: "Cuidados" },
                { k: "ship", l: "Envíos" }
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k as any)}
                  className={`-mb-px border-b-2 pb-2 font-semibold ${tab === t.k ? "border-smurf-500 text-ink" : "border-transparent text-ink/60"}`}
                >
                  {t.l}
                </button>
              ))}
            </div>
            <div className="prose prose-neutral mt-4 max-w-none text-sm text-ink/85">
              {tab === "desc" && <p>{product.description}</p>}
              {tab === "specs" && (
                <ul>
                  <li>Línea: {product.line}</li>
                  <li>Tallas disponibles: {Array.from(new Set(product.variants.map((v) => v.size))).join(", ")}</li>
                  <li>Colores: {product.colors.map((c) => c.color).join(", ")}</li>
                  <li>SKU base: {product.id.slice(-8).toUpperCase()}</li>
                </ul>
              )}
              {tab === "care" && (
                <ul>
                  <li>Limpia con paño húmedo y jabón neutro.</li>
                  <li>No usar lavadora ni secadora.</li>
                  <li>Conservar en lugar fresco y seco.</li>
                </ul>
              )}
              {tab === "ship" && (
                <ul>
                  <li>Estándar 3-5 días, gratis a partir de 50€.</li>
                  <li>Express 1-2 días: 9,99€.</li>
                  <li>Devoluciones gratuitas dentro de los 30 días.</li>
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* REVIEWS */}
      <section className="mt-20">
        <h2 className="h-display text-3xl">Valoraciones</h2>
        <div className="mt-6 grid gap-8 md:grid-cols-[260px_1fr]">
          <div>
            <div className="text-5xl font-extrabold">{product.rating ? product.rating.toFixed(1) : "—"}</div>
            <div className="flex text-amber-500">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} size={18} fill={i < Math.round(product.rating) ? "currentColor" : "none"} />
              ))}
            </div>
            <div className="text-sm text-ink/60">{product.ratingCount} valoraciones</div>
            <ul className="mt-4 space-y-1 text-xs">
              {ratingDist.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-6">{5 - i}★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-ink/10">
                    <div
                      className="h-full bg-smurf-500"
                      style={{ width: `${product.reviews.length ? (c / product.reviews.length) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <ul className="space-y-5">
            {product.reviews.length === 0 && (
              <li className="rounded-xl border border-ink/10 p-5 text-sm text-ink/60">
                Aún no hay valoraciones. Sé el primero en opinar tras tu compra.
              </li>
            )}
            {product.reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-ink/10 p-5">
                <div className="flex items-center gap-2 text-amber-500">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} size={14} fill={i < r.rating ? "currentColor" : "none"} />
                  ))}
                </div>
                {r.title && <div className="mt-1 font-semibold">{r.title}</div>}
                <p className="mt-1 text-sm">{r.body}</p>
                <div className="mt-2 text-xs text-ink/55">
                  {r.authorName} · {new Date(r.createdAt).toLocaleDateString("es-ES")}
                  {r.verified ? " · Compra verificada" : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* RELATED */}
      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="h-display text-3xl">Completa el look</h2>
          <div className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.slug} {...p} />
            ))}
          </div>
        </section>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-6" onClick={() => setZoom(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={filteredImages[imgIdx].url} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}

      {/* Sticky mobile bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-white/95 p-3 backdrop-blur md:hidden">
        <div className="container-x flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink/60">{product.line}</div>
            <div className="text-base font-extrabold">{formatPrice(eff)}</div>
          </div>
          <button onClick={() => handleAdd(false)} className="btn-primary">
            Añadir
          </button>
        </div>
      </div>
    </article>
  );
}
