"use client";

import { useMemo, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { Heart, ShieldCheck, ShoppingBag, Star, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductDetailView } from "@/lib/catalog";

type ProductDetailPageProps = {
  product: NonNullable<ProductDetailView>;
};

export function ProductDetailPage({ product }: ProductDetailPageProps) {
  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.colorName ?? "");
  const [selectedSize, setSelectedSize] = useState(product.colors[0]?.sizes[0]?.size ?? "");
  const [deliveryZip, setDeliveryZip] = useState("28013");

  const activeColor = useMemo(
    () => product.colors.find((item) => item.colorName === selectedColor) ?? product.colors[0],
    [product.colors, selectedColor],
  );

  const activeSize = activeColor?.sizes.find((size) => size.size === selectedSize) ?? activeColor?.sizes[0];
  const gallery = product.images.filter(
    (image) => !activeColor?.colorHex || image.colorHex === activeColor.colorHex || image.isPrimary,
  );

  return (
    <div className="page-shell page-stack">
      <nav className="breadcrumb">
        <Link href="/">Inicio</Link> /{" "}
        {product.categorySlug ? <Link href={`/${product.categorySlug}`}>{product.categoryName}</Link> : product.categoryName} /{" "}
        <span>{product.name}</span>
      </nav>

      <section className="product-detail-grid">
        <div className="product-gallery">
          <div className="product-hero-image">
            <Image
              src={gallery[0]?.url ?? product.images[0]?.url ?? ""}
              alt={gallery[0]?.alt ?? product.name}
              fill
              className="object-cover"
            />
          </div>
          <div className="product-thumbs">
            {gallery.map((image) => (
              <button key={image.id} type="button" className="product-thumb">
                <Image src={image.url} alt={image.alt} fill className="object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="product-panel">
          <div className="section-eyebrow">{product.line}</div>
          <h1>{product.name}</h1>
          <p className="muted">{product.subtitle ?? product.shortDescription}</p>

          <div className="review-stars" style={{ marginTop: 10 }}>
            {Array.from({ length: 5 }).map((_, index) => (
              <Star key={index} size={16} fill={index < Math.round(product.ratingAverage) ? "currentColor" : "none"} />
            ))}
            <span className="muted">
              {product.ratingAverage.toFixed(1)} · {product.ratingCount} reviews
            </span>
          </div>

          <div className="price-stack">
            <strong>{product.priceLabel}</strong>
            {product.compareAtPriceLabel ? <s>{product.compareAtPriceLabel}</s> : null}
            {product.badge ? <span className="badge sale">{product.badge}</span> : null}
          </div>

          <div className="selector-block">
            <div className="selector-head">
              <span>Color</span>
              <strong>{activeColor?.colorName}</strong>
            </div>
            <div className="swatch-row">
              {product.colors.map((color) => (
                <button
                  key={color.colorName}
                  type="button"
                  aria-label={color.colorName}
                  className={`color-swatch ${selectedColor === color.colorName ? "active" : ""}`}
                  style={{ background: color.colorHex }}
                  onClick={() => {
                    setSelectedColor(color.colorName);
                    setSelectedSize(color.sizes[0]?.size ?? "");
                  }}
                />
              ))}
            </div>
          </div>

          <div className="selector-block">
            <div className="selector-head">
              <span>Talla</span>
              <Link href="/guia-de-tallas">Guia de tallas</Link>
            </div>
            <div className="size-grid">
              {activeColor?.sizes.map((size) => (
                <button
                  key={`${activeColor.colorName}-${size.size}`}
                  type="button"
                  className={`size-chip ${selectedSize === size.size ? "active" : ""} ${size.stock < 1 ? "disabled" : ""}`}
                  onClick={() => setSelectedSize(size.size)}
                  disabled={size.stock < 1}
                >
                  {size.size}
                </button>
              ))}
            </div>
          </div>

          <div className="stock-notice">
            Solo quedan {Math.max(activeSize?.stock ?? product.stockNotice, 1)} unidades en esta configuracion.
          </div>

          <div className="hero-actions" style={{ width: "100%" }}>
            <Button
              href={`/checkout?sku=${encodeURIComponent(activeSize?.sku ?? product.sku)}`}
              className="full-width"
            >
              <ShoppingBag size={16} /> Anadir al carrito
            </Button>
            <Button
              href={`/checkout?sku=${encodeURIComponent(activeSize?.sku ?? product.sku)}&mode=now`}
              variant="secondary"
              className="full-width"
            >
              Comprar ahora
            </Button>
            <button type="button" className="icon-chip">
              <Heart size={18} />
            </button>
          </div>

          <div className="delivery-estimator">
            <label htmlFor="zip">Entrega estimada</label>
            <div className="delivery-row">
              <input
                id="zip"
                value={deliveryZip}
                onChange={(event) => setDeliveryZip(event.target.value)}
                placeholder="Codigo postal"
              />
              <span>{deliveryZip ? "Recibe entre 24 y 72h en Peninsula" : "Introduce tu codigo postal"}</span>
            </div>
          </div>

          <div className="trust-grid">
            <div className="trust-card">
              <Truck size={16} />
              <span>Envio premium y recogida en punto.</span>
            </div>
            <div className="trust-card">
              <ShieldCheck size={16} />
              <span>Pago seguro y devoluciones sencillas.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card static-page-card">
        <div className="static-page-body">
          <h2>Descripcion</h2>
          <p>{product.longDescription}</p>
          <div className="static-columns">
            <div>
              <h3>Caracteristicas tecnicas</h3>
              <ul>
                {product.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Guia de cuidado</h3>
              <ul>
                {product.care.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Envios y devoluciones</h3>
              <ul>
                {product.shipping.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell section-stack">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Reviews</span>
            <h2>Feedback de clientes.</h2>
          </div>
        </div>
        {product.reviews.length ? (
          <div className="review-grid">
            {product.reviews.map((review) => (
              <article key={review.id} className="review-card">
                <div className="review-stars">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} size={16} fill={index < review.rating ? "currentColor" : "none"} />
                  ))}
                </div>
                <h3>{review.title}</h3>
                <p>{review.body}</p>
                <div className="muted">
                  {review.author} · {review.verifiedPurchase ? "Compra verificada" : "Cliente"}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="card static-page-card">
            <div className="static-page-body">
              <p className="muted">
                Todavia no hay valoraciones publicadas para este producto. La primera compra real
                podra dejar la primera review.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="page-shell section-stack">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Completa el look</span>
            <h2>Los clientes tambien compraron.</h2>
          </div>
        </div>
        <div className="listing-grid">
          {product.related.map((item) => (
            <Link key={item.id} href={`/producto/${item.slug}`} className="product-card">
              <div className="product-media">
                <Image src={item.image} alt={item.name} fill className="object-cover" />
              </div>
              <div className="product-meta">
                <h3>{item.name}</h3>
                <p className="muted">{item.shortDescription}</p>
                <strong>{item.priceLabel}</strong>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
