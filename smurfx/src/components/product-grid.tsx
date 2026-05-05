"use client";
import { useEffect, useRef, useState } from "react";
import { ProductCard } from "./product-card";

type APIItem = {
  id: string;
  slug: string;
  name: string;
  line: string;
  basePrice: number;
  salePrice: number | null;
  isNew: boolean;
  images: { url: string; alt: string | null; color: string | null }[];
  colorHexes: { color: string; colorHex: string }[];
  colors: string[];
  sizes: string[];
};

export function ProductGrid({ baseQuery }: { baseQuery: string }) {
  const [items, setItems] = useState<APIItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [next, setNext] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems([]);
    setNext(null);
    load(undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseQuery]);

  async function load(cursor?: string | null) {
    setLoading(true);
    const url = `/api/products?${baseQuery}${cursor ? `&cursor=${cursor}` : ""}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    setItems((s) => (cursor ? [...s, ...j.items] : j.items));
    setNext(j.next);
    setLoading(false);
  }

  useEffect(() => {
    if (!sentinel.current || !next) return;
    const ob = new IntersectionObserver((es) => {
      if (es[0].isIntersecting && !loading) load(next);
    });
    ob.observe(sentinel.current);
    return () => ob.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, loading]);

  return (
    <div>
      <div className="mb-4 text-sm text-ink/60">
        {items.length} {items.length === 1 ? "producto" : "productos"}
        {next ? "+" : ""}
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => (
          <ProductCard
            key={p.id}
            slug={p.slug}
            name={p.name}
            line={p.line}
            basePrice={p.basePrice}
            salePrice={p.salePrice}
            isNew={p.isNew}
            images={p.images}
            colorHexes={p.colorHexes}
          />
        ))}
        {loading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={`s${i}`} className="space-y-2">
              <div className="aspect-[4/5] w-full animate-shimmer rounded-2xl bg-smurf-50/60 shimmer" />
              <div className="h-3 w-2/3 animate-shimmer rounded bg-smurf-50/60 shimmer" />
              <div className="h-3 w-1/3 animate-shimmer rounded bg-smurf-50/60 shimmer" />
            </div>
          ))}
      </div>
      <div ref={sentinel} className="mt-8 h-10" />
    </div>
  );
}
