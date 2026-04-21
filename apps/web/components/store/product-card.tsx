import Image from "next/image";
import Link from "next/link";
import { Heart, ShoppingBag } from "lucide-react";

import type { ProductCardView } from "@/lib/catalog";
import { formatPrice } from "@/lib/utils";

type ProductCardProps = {
  product: ProductCardView;
};

export function ProductCard({ product }: ProductCardProps) {
  const primary = product.image;
  const secondary = product.secondaryImage || primary;
  const basePrice =
    typeof product.basePrice === "string" ? Number(product.basePrice) : product.basePrice;
  const compareAtPrice =
    product.compareAtPrice == null
      ? null
      : typeof product.compareAtPrice === "string"
        ? Number(product.compareAtPrice)
        : product.compareAtPrice;

  return (
    <article className="product-card">
      <Link href={`/producto/${product.slug}`} className="product-media">
        {product.isNew ? <span className="badge">Nuevo</span> : null}
        {product.isSale ? <span className="badge sale">Sale</span> : null}
        {primary ? (
          <>
            <Image src={primary} alt={product.name} fill sizes="(max-width: 768px) 50vw, 25vw" />
            {secondary ? (
              <Image
                src={secondary}
                alt={`${product.name} vista secundaria`}
                fill
                className="secondary-image"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            ) : null}
          </>
        ) : null}
      </Link>
      <div className="product-meta">
        <div className="product-meta-top">
          <div>
            <p className="eyebrow">{product.line}</p>
            <h3>{product.name}</h3>
            <p className="muted">{product.subtitle ?? product.shortDescription}</p>
          </div>
          <button type="button" className="icon-chip" aria-label={`Guardar ${product.name}`}>
            <Heart size={16} />
          </button>
        </div>
        <div className="product-meta-bottom">
          <div className="price-row">
            <span>{formatPrice(basePrice)}</span>
            {compareAtPrice ? <s>{formatPrice(compareAtPrice)}</s> : null}
          </div>
          <button type="button" className="icon-chip fill" aria-label={`Añadir ${product.name}`}>
            <ShoppingBag size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
