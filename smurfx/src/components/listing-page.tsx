"use client";
import { useSearchParams } from "next/navigation";
import { ListingFilters } from "./listing-filters";
import { ProductGrid } from "./product-grid";

export function ListingPage({
  basePath,
  baseQuery,
  title,
  breadcrumb
}: {
  basePath: string;
  baseQuery?: Record<string, string>;
  title: string;
  breadcrumb: { label: string; href?: string }[];
}) {
  const sp = useSearchParams();
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(baseQuery || {})) query.set(k, v);
  sp.forEach((v, k) => {
    if (k === "page") return;
    query.append(k, v);
  });

  return (
    <div className="container-x py-10">
      <nav className="mb-4 text-xs text-ink/60">
        {breadcrumb.map((b, i) => (
          <span key={i}>
            {b.href ? <a href={b.href} className="hover:text-ink">{b.label}</a> : b.label}
            {i < breadcrumb.length - 1 && " / "}
          </span>
        ))}
      </nav>
      <h1 className="h-display mb-6 text-4xl md:text-5xl">{title}</h1>
      <div className="grid gap-8 md:grid-cols-[260px_1fr]">
        <div>
          <ListingFilters basePath={basePath} />
        </div>
        <div>
          <ProductGrid baseQuery={query.toString()} />
        </div>
      </div>
    </div>
  );
}
