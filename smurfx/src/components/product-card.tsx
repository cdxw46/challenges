import Link from "next/link";
import { formatPrice, discountPct, effectivePrice } from "@/lib/format";
import clsx from "clsx";

export type ProductCardProps = {
  slug: string;
  name: string;
  line: string;
  basePrice: number;
  salePrice?: number | null;
  isNew?: boolean;
  images: { url: string; alt?: string | null; color?: string | null }[];
  colorHexes?: { color: string; colorHex: string }[];
};

export function ProductCard(p: ProductCardProps) {
  const eff = effectivePrice(p.basePrice, p.salePrice);
  const off = discountPct(p.basePrice, p.salePrice);
  const primary = p.images[0]?.url;
  const secondary = p.images[1]?.url ?? primary;

  return (
    <Link
      href={`/producto/${p.slug}`}
      className="product-card group block"
      aria-label={p.name}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-smurf-50">
        {primary && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primary} alt={p.name} className="img-primary absolute inset-0 h-full w-full object-cover" />
        )}
        {secondary && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={secondary} alt={p.name} className="img-secondary absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          {p.isNew && (
            <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Nuevo
            </span>
          )}
          {off > 0 && (
            <span className="rounded-full bg-smurf-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              -{off}%
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-ink/55">{p.line}</div>
          <div className="mt-0.5 text-sm font-semibold leading-tight">{p.name}</div>
        </div>
        <div className="text-right">
          <div className={clsx("text-sm font-bold", off > 0 && "text-smurf-500")}>{formatPrice(eff)}</div>
          {off > 0 && (
            <div className="text-[11px] text-ink/45 line-through">{formatPrice(p.basePrice)}</div>
          )}
        </div>
      </div>
      {p.colorHexes && p.colorHexes.length > 0 && (
        <div className="mt-2 flex gap-1">
          {p.colorHexes.slice(0, 4).map((c) => (
            <span
              key={c.color}
              className="h-3 w-3 rounded-full border border-ink/10"
              style={{ background: c.colorHex }}
              title={c.color}
            />
          ))}
          {p.colorHexes.length > 4 && (
            <span className="text-[10px] text-ink/50">+{p.colorHexes.length - 4}</span>
          )}
        </div>
      )}
    </Link>
  );
}
