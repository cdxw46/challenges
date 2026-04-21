"use client";

import Image from "next/image";

import { ProductCard } from "@/components/store/product-card";
import type { CollectionDetailView } from "@/lib/catalog";

export function CollectionPage({ collection }: { collection: CollectionDetailView }) {
  return (
    <div className="page-stack">
      <section className="hero" style={{ minHeight: "70vh" }}>
        <Image src={collection.coverImage} alt={collection.name} fill priority className="hero-media" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-kicker">Coleccion SMURFX</div>
          <h1>{collection.heroTitle ?? collection.name}</h1>
          <p>{collection.heroSubtitle ?? collection.story ?? "Seleccion editorial de producto SMURFX."}</p>
        </div>
      </section>

      <section className="page-shell section-stack">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Historia</span>
            <h2>{collection.name}</h2>
          </div>
        </div>
        <div className="card static-page-card">
          <div className="static-page-body">
            <p>{collection.story ?? "Narrativa de producto, materiales y actitud visual de la coleccion."}</p>
          </div>
        </div>
      </section>

      <section className="page-shell section-stack">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Productos</span>
            <h2>{collection.products.length} piezas en esta coleccion.</h2>
          </div>
        </div>
        <div className="listing-grid">
          {collection.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
