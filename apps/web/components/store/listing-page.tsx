"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { ProductCard } from "@/components/store/product-card";
import { Button } from "@/components/ui/button";
import type { ListingResult, ProductCardView } from "@/lib/catalog";

type ListingPageProps = {
  title: string;
  description: string;
  breadcrumb: { label: string; href?: string }[];
  result: ListingResult;
  activeFilters?: Record<string, string | number | boolean | undefined>;
  basePath?: string;
};

const sortOptions = [
  { label: "Relevancia", value: "relevance" },
  { label: "Mas nuevo", value: "newest" },
  { label: "Precio ascendente", value: "price-asc" },
  { label: "Precio descendente", value: "price-desc" },
  { label: "Mas valorados", value: "top-rated" },
];

function formatFilterLabel(key: string, value: string | number | boolean | undefined) {
  if (value === undefined || value === "" || value === false) return null;
  const labels: Record<string, string> = {
    q: `Busqueda: ${value}`,
    line: `Linea: ${value}`,
    activity: `Actividad: ${value}`,
    sort: `Orden: ${sortOptions.find((item) => item.value === value)?.label ?? value}`,
    sale: "Sale",
    isNew: "Nuevo",
    gender: `Genero: ${value}`,
  };
  return labels[key] ?? `${key}: ${value}`;
}

function FilterChip({
  label,
  href,
}: {
  label: string;
  href: string;
}) {
  return (
    <Link className="filter-chip" href={href}>
      {label} ×
    </Link>
  );
}

export function ListingPage({
  title,
  description,
  breadcrumb,
  result,
  activeFilters = {},
  basePath = "",
}: ListingPageProps) {
  const chips = Object.entries(activeFilters)
    .map(([key, value]) => {
      const label = formatFilterLabel(key, value);
      if (!label) return null;
      const params = new URLSearchParams();
      Object.entries(activeFilters).forEach(([paramKey, paramValue]) => {
        if (paramKey === key || paramValue === undefined || paramValue === "" || paramValue === false) return;
        params.set(paramKey, String(paramValue));
      });
      const href = `${basePath}${params.toString() ? `?${params.toString()}` : ""}`;
      return { key, label, href };
    })
    .filter(Boolean) as { key: string; label: string; href: string }[];

  return (
    <div className="page-shell page-stack listing-shell">
      <nav className="breadcrumb">
        {breadcrumb.map((item, index) => (
          <span key={`${item.label}-${index}`}>
            {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
            {index < breadcrumb.length - 1 ? " / " : ""}
          </span>
        ))}
      </nav>

      <section className="listing-hero">
        <div>
          <span className="section-eyebrow">Catalogo</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="listing-meta">
          <span>{result.count} resultados</span>
          <Button variant="ghost">
            <SlidersHorizontal size={16} />
            Filtros
          </Button>
        </div>
      </section>

      <div className="listing-body">
        <aside className="listing-sidebar">
          <div className="filter-block">
            <h3>Actividad</h3>
            <div className="filter-links">
              {["Running", "Training", "Lifestyle", "Trail"].map((activity) => {
                const params = new URLSearchParams();
                Object.entries(activeFilters).forEach(([key, value]) => {
                  if (value === undefined || value === "" || value === false) return;
                  params.set(key, String(value));
                });
                params.set("activity", activity);
                return (
                  <Link key={activity} href={`${basePath}?${params.toString()}`}>
                    {activity}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="filter-block">
            <h3>Linea</h3>
            <div className="filter-links">
              {["SmurfAir", "SmurfForce", "SmurfRun", "SmurfGlide", "SmurfTrail"].map((line) => {
                const params = new URLSearchParams();
                Object.entries(activeFilters).forEach(([key, value]) => {
                  if (value === undefined || value === "" || value === false) return;
                  params.set(key, String(value));
                });
                params.set("line", line);
                return (
                  <Link key={line} href={`${basePath}?${params.toString()}`}>
                    {line}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="filter-block">
            <h3>Ordenar</h3>
            <div className="filter-links">
              {sortOptions.map((item) => {
                const params = new URLSearchParams();
                Object.entries(activeFilters).forEach(([key, value]) => {
                  if (value === undefined || value === "" || value === false) return;
                  params.set(key, String(value));
                });
                params.set("sort", item.value);
                return (
                  <Link key={item.value} href={`${basePath}?${params.toString()}`}>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="listing-main">
          {chips.length ? (
            <div className="active-filters">
              {chips.map((chip) => (
                <FilterChip key={chip.key} label={chip.label} href={chip.href} />
              ))}
            </div>
          ) : null}

          <div className="listing-grid">
            {result.products.map((product: ProductCardView) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
