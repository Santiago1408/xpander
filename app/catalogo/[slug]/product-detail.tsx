"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { addToStoredCart, openCart } from "../../cart-store";
import { notify } from "../../toast";
import MediaImage from "../../media-image";
import { BrandPlaceholder } from "../../product-card";
import { colorSwatch, formatBOB, hasPriceRange, lowestPrice, productHref, productInStock, sizeLabel, titleCase, variantInStock } from "../../shop-format";
import type { CatalogProduct } from "../catalog-shop";

function Accordion({ title, children, open: initiallyOpen = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <div className="border-b border-line">
    <button aria-expanded={open} className="flex min-h-14 w-full items-center justify-between text-left text-[15px] font-semibold"
      onClick={() => setOpen(!open)} type="button">
      <span>{title}</span><span aria-hidden="true" className="font-mono text-lg font-normal">{open ? "−" : "+"}</span>
    </button>
    {open && <div className="pb-5 text-sm leading-[1.65] text-body">{children}</div>}
  </div>;
}

export default function ProductDetail({ product, siblings, knownVariantIds, qrAvailable }: {
  product: CatalogProduct; siblings: CatalogProduct[]; knownVariantIds: number[]; qrAvailable: boolean;
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const inStockVariants = product.variants.filter((item) => variantInStock(item));
  const [variantId, setVariantId] = useState(product.variants.length === 1 && inStockVariants.length === 1 ? product.variants[0].id : 0);
  const soldOut = !productInStock(product);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const known = useMemo(() => new Set(knownVariantIds), [knownVariantIds]);
  const variant = product.variants.find((item) => item.id === variantId);
  const image = product.media[imageIndex];
  const price = variant ? variant.priceMinor : lowestPrice(product);
  const compareAt = variant?.compareAtPriceMinor ?? null;
  const colors = [product, ...siblings].sort((a, b) => a.color.localeCompare(b.color, "es-BO"));

  function add() {
    setError("");
    if (!variant) { setError("Elige una talla para continuar."); return; }
    if (!variantInStock(variant)) { setError("Esta talla no tiene existencias."); return; }
    const result = addToStoredCart(variant.id, quantity, (id) => known.has(id));
    if (!result.ok) { setError(result.reason); notify.error(result.reason); return; }
    const message = `Añadido al carrito · Talla ${sizeLabel(variant)} · ${result.quantity} ${result.quantity === 1 ? "unidad" : "unidades"} en total`;
    notify.success(message, { label: "Ver carrito", onClick: openCart });
  }

  return (
    <section className="xp-container flex flex-col items-start gap-[clamp(32px,4vw,64px)] pt-6 lg:flex-row">
      <div className="flex w-full min-w-0 flex-col-reverse gap-4 sm:flex-row lg:flex-1">
        {product.media.length > 1 && <div aria-label="Vistas del producto" className="flex gap-2.5 overflow-x-auto sm:w-[84px] sm:shrink-0 sm:flex-col" role="group">
          {product.media.map((item, index) => <button aria-label={`Ver imagen ${index + 1}`} aria-pressed={index === imageIndex}
            className={`relative aspect-[4/5] w-[72px] shrink-0 overflow-hidden bg-mist sm:w-full ${index === imageIndex ? "outline outline-1 outline-offset-2 outline-ink" : "opacity-70 hover:opacity-100"}`}
            key={item.id} onClick={() => setImageIndex(index)} type="button">
            <MediaImage alt="" className="absolute inset-0 h-full w-full object-cover" height={200} sizes="84px" src={item.url} width={160} />
          </button>)}
        </div>}
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-mist">
          {image ? <MediaImage alt={image.altText || product.name} className="absolute inset-0 h-full w-full object-cover" height={1500}
            loading="eager" sizes="(max-width: 1024px) 100vw, 60vw" src={image.url} width={1200} /> : <BrandPlaceholder />}
          {soldOut ? <span className="absolute left-4 top-4 bg-ink px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-white">Sin existencias</span> :
            product.isFeatured && <span className="absolute left-4 top-4 bg-white px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em]">Destacado</span>}
          {product.media.length > 1 && <span className="absolute bottom-4 right-4 bg-white/90 px-2 py-1 font-mono text-xs">{imageIndex + 1} / {product.media.length}</span>}
        </div>
      </div>

      <div className="flex w-full flex-col gap-7 lg:sticky lg:top-6 lg:max-w-[520px] lg:flex-[0_1_440px]">
        <div className="flex flex-col gap-3">
          <span className="xp-label text-graphite">{[product.style, product.audience, `Cód. ${product.code}`].filter(Boolean).join(" · ")}</span>
          <h1 className="xp-display m-0 text-[clamp(32px,3.4vw,48px)] leading-none tracking-[-0.01em] [overflow-wrap:anywhere]">{product.name}</h1>
          <div className="flex flex-wrap items-baseline gap-4">
            <span className="font-mono text-[22px]">{!variant && hasPriceRange(product) ? "Desde " : ""}{formatBOB(price)}</span>
            {compareAt !== null && compareAt > price && <span className="font-mono text-sm text-graphite line-through">{formatBOB(compareAt)}</span>}
            {product.brandName && <span className="text-[13px] text-graphite">{product.brandName}</span>}
          </div>
        </div>

        {product.color && <div className="flex flex-col gap-3">
          <div className="flex justify-between text-sm"><span className="font-semibold">Color</span><span className="text-graphite">{titleCase(product.color)}</span></div>
          <div aria-label="Colores disponibles" className="flex flex-wrap gap-2.5" role="group">
            {colors.map((item) => {
              const current = item.id === product.id;
              const style = { background: colorSwatch(item.color) ?? "conic-gradient(#141414 0 25%, #8a8a8a 0 50%, #ededed 0 75%, #5e5e5e 0)" };
              const className = `size-10 rounded-full border-[3px] border-white ${current ? "shadow-[0_0_0_1px_#141414]" : "shadow-[0_0_0_1px_#e2e2e2] hover:shadow-[0_0_0_1px_#5e5e5e]"}`;
              return current ? <span aria-current="true" aria-label={titleCase(item.color)} className={className} key={item.id} style={style} title={titleCase(item.color)} /> :
                <Link aria-label={`Ver en ${titleCase(item.color)}`} className={className} href={productHref(item)} key={item.id} style={style} title={titleCase(item.color)} />;
            })}
          </div>
        </div>}

        <div className="flex flex-col gap-3">
          <div className="flex justify-between text-sm"><span className="font-semibold">Talla</span>
            {variant && <span className="font-mono text-xs text-graphite">Código {variant.code}</span>}</div>
          <div aria-label="Talla" className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5" role="group">
            {product.variants.map((item) => {
              const available = variantInStock(item);
              return <button aria-label={available ? `Talla ${sizeLabel(item)}` : `Talla ${sizeLabel(item)}, sin existencias`} aria-pressed={item.id === variantId}
                className={`min-h-12 border px-2 font-mono text-[13px] disabled:cursor-not-allowed disabled:border-line disabled:bg-soft disabled:text-[#bdbdbd] disabled:line-through ${item.id === variantId ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
                disabled={!available} key={item.id} onClick={() => { setVariantId(item.id); setError(""); }} type="button">{sizeLabel(item)}</button>;
            })}
          </div>
          <span className="text-[13px] text-graphite">{soldOut ? "Este producto no tiene existencias por el momento." :
            inStockVariants.length < product.variants.length ? `${product.variants.length - inStockVariants.length} talla(s) sin existencias. La disponibilidad en tu sucursal se confirma al registrar el pedido.` :
            "La disponibilidad en tu sucursal se confirma al registrar el pedido."}</span>
        </div>

        <div className="flex gap-2.5">
          <div className="flex h-14 items-center border border-line">
            <button aria-label="Quitar una unidad" className="h-full w-12 text-lg disabled:text-line" disabled={quantity <= 1}
              onClick={() => setQuantity(quantity - 1)} type="button">−</button>
            <span aria-live="polite" className="w-8 text-center font-mono text-[15px]">{quantity}</span>
            <button aria-label="Añadir una unidad" className="h-full w-12 text-lg disabled:text-line" disabled={quantity >= 20}
              onClick={() => setQuantity(quantity + 1)} type="button">+</button>
          </div>
          <button className="xp-btn h-14 flex-1 bg-ink px-4 tracking-[0.08em] text-white enabled:hover:bg-[#333] disabled:cursor-not-allowed disabled:bg-[#bdbdbd]" disabled={soldOut} onClick={add} type="button">
            {soldOut ? "Sin existencias" : variant ? `Añadir al carrito · ${formatBOB(variant.priceMinor * quantity)}` : "Elige una talla"}
          </button>
        </div>
        {error && <p className="m-0 -mt-3 text-sm text-red-700" role="alert">{error}</p>}

        <div className="grid grid-cols-3 gap-px border border-line bg-line text-center text-xs">
          <div className="flex flex-col gap-1 bg-white px-2 py-3.5"><span className="font-semibold">Recojo o envío</span><span className="text-graphite">Envío por WhatsApp</span></div>
          <div className="flex flex-col gap-1 bg-white px-2 py-3.5"><span className="font-semibold">Pago por QR</span><span className="text-graphite">{qrAvailable ? "Desde tu banco" : "Temporalmente no disponible"}</span></div>
          <div className="flex flex-col gap-1 bg-white px-2 py-3.5"><span className="font-semibold">Precios en Bs.</span><span className="text-graphite">Bolivianos</span></div>
        </div>

        <div className="border-t border-ink">
          {product.description && <Accordion open title="Descripción"><p className="m-0 whitespace-pre-line">{product.description}</p></Accordion>}
          <Accordion open={!product.description} title="Detalles del producto">
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
              {product.brandName && <><dt className="text-graphite">Marca</dt><dd className="m-0">{product.brandName}</dd></>}
              {product.style && <><dt className="text-graphite">Estilo</dt><dd className="m-0">{titleCase(product.style)}</dd></>}
              {product.audience && <><dt className="text-graphite">Público</dt><dd className="m-0">{titleCase(product.audience)}</dd></>}
              {product.color && <><dt className="text-graphite">Color</dt><dd className="m-0">{titleCase(product.color)}</dd></>}
              <dt className="text-graphite">Código</dt><dd className="m-0 font-mono">{product.code}</dd>
            </dl>
          </Accordion>
          <Accordion title="Recojo y pago">
            <p className="m-0">Agrega tus productos al carrito y pulsa «Finalizar compra». Elige recojo en sucursal o envío a domicilio (la dirección y el costo del envío se coordinan por WhatsApp).
              Paga los productos con el QR del negocio, adjunta tu comprobante y envía el detalle por WhatsApp. El negocio verifica el abono en su banca y confirma tu pedido.</p>
          </Accordion>
        </div>
      </div>
    </section>
  );
}
