import Link from "next/link";
import MediaImage from "./media-image";
import QuickAdd from "./quick-add";
import type { CatalogProduct } from "./catalogo/catalog-shop";
import { discountPercent, formatBOB, hasPriceRange, productHref, productInStock, titleCase } from "./shop-format";

export function BrandPlaceholder({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`absolute inset-0 flex items-center justify-center ${className}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
    <img alt="" className="w-[46%] opacity-[0.07]" src="/api/brand/isotipo" />
  </div>;
}

// The cheapest variant leads the card; its regular price is shown struck through.
function leadVariant(product: CatalogProduct) {
  return product.variants.reduce((best, variant) => variant.priceMinor < best.priceMinor ? variant : best, product.variants[0]);
}

function cardDetail(product: CatalogProduct): string {
  const sizes = product.variants.length;
  return [product.style && titleCase(product.style), product.audience && titleCase(product.audience),
    sizes > 1 ? `${sizes} tallas` : ""].filter(Boolean).join(" · ");
}

export default function ProductCard({ product, sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" }: {
  product: CatalogProduct; sizes?: string;
}) {
  const [image, hover] = product.media;
  const lead = leadVariant(product);
  const discount = discountPercent(product);
  const inStock = productInStock(product);
  const tag = !inStock ? "Sin existencias" : discount > 0 ? `−${discount}%` : product.isFeatured ? "Destacado" : "";
  return (
    <div className="xp-card group relative" id={`producto-${product.id}`}>
    <Link className="flex flex-col gap-3.5 text-ink" href={productHref(product)}>
      <div className={`relative aspect-[3/4] overflow-hidden bg-mist ${inStock ? "" : "opacity-60 grayscale"}`}>
        {image ? <MediaImage alt={image.altText || product.name} className="absolute inset-0 h-full w-full object-cover"
          height={1067} sizes={sizes} src={image.url} width={800} /> : <BrandPlaceholder />}
        {hover && <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <MediaImage alt="" className="absolute inset-0 h-full w-full object-cover" height={1067} sizes={sizes} src={hover.url} width={800} />
        </div>}
        {tag && <span className={`absolute left-3 top-3 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${inStock ? "bg-white" : "bg-ink text-white"}`}>{tag}</span>}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[15px] font-medium leading-snug">{titleCase(product.name)}</span>
          {cardDetail(product) && <span className="text-[13px] text-graphite">{cardDetail(product)}</span>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="whitespace-nowrap font-mono text-sm" title={hasPriceRange(product) ? "Precio desde" : undefined}>{formatBOB(lead.priceMinor)}</span>
          {lead.compareAtPriceMinor !== null && lead.compareAtPriceMinor > lead.priceMinor &&
            <span className="whitespace-nowrap font-mono text-xs text-graphite line-through">{formatBOB(lead.compareAtPriceMinor)}</span>}
        </div>
      </div>
    </Link>
    {inStock && <QuickAdd product={product} />}
    </div>
  );
}
