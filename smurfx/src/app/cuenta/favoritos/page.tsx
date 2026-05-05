"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/account/dashboard";
import { ProductCard } from "@/components/product-card";

export default function Page() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/account/wishlist", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setItems(j.items || []))
      .catch(() => {});
  }, []);
  return (
    <div className="container-x grid gap-8 py-10 md:grid-cols-[260px_1fr]">
      <Sidebar />
      <div>
        <h1 className="h-display text-3xl">Favoritos</h1>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">Aún no tienes favoritos.</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-3">
            {items.map((it) => (
              <ProductCard
                key={it.id}
                slug={it.product.slug}
                name={it.product.name}
                line={it.product.line}
                basePrice={it.product.basePrice}
                salePrice={it.product.salePrice}
                isNew={it.product.isNew}
                images={it.product.images.map((x: any) => ({ url: x.url, alt: x.alt }))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
