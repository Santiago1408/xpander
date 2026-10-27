"use client";

import { useEffect, useRef, useState } from "react";
import { addToStoredCart, openCart } from "./cart-store";
import { notify } from "./toast";
import type { CatalogProduct } from "./catalogo/catalog-shop";
import { sizeLabel, variantInStock } from "./shop-format";

// "+" over a product image: adds one unit, asking for the size when there are several.
export default function QuickAdd({ product }: { product: CatalogProduct }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [open]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [message]);

  function add(variant: CatalogProduct["variants"][number]) {
    // Unknown lines are dropped later by the cart, which validates against the full catalog.
    const result = addToStoredCart(variant.id, 1, () => true);
    setOpen(false);
    setMessage(result.ok ? `Añadido · Talla ${sizeLabel(variant)}` : result.reason);
    if (result.ok) notify.success(`${product.name} · Talla ${sizeLabel(variant)} añadido al carrito.`, { label: "Ver carrito", onClick: openCart });
    else notify.error(result.reason);
  }

  return <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[3/4]" ref={root}>
    {open && <div className="pointer-events-auto absolute inset-x-2 bottom-2 bg-white p-3 shadow-lg" role="dialog" aria-label={`Elegir talla de ${product.name}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-graphite">Elige talla</span>
        <button aria-label="Cerrar" className="size-6 text-graphite hover:text-ink" onClick={() => setOpen(false)} type="button">✕</button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-1.5">
        {product.variants.map((variant) => {
          const available = variantInStock(variant);
          return <button aria-label={available ? `Talla ${sizeLabel(variant)}` : `Talla ${sizeLabel(variant)}, sin existencias`}
            className="h-10 border border-line px-1 font-mono text-xs enabled:hover:border-ink enabled:hover:bg-ink enabled:hover:text-white disabled:text-[#bdbdbd] disabled:line-through"
            disabled={!available} key={variant.id} onClick={() => add(variant)} type="button">{sizeLabel(variant)}</button>;
        })}
      </div>
    </div>}
    {message && <span className="absolute inset-x-2 bottom-2 bg-ink px-3 py-2.5 text-center text-xs font-medium text-white" role="status">{message}</span>}
    {!open && !message && <button aria-label={`Agregar ${product.name} al carrito`}
      className="pointer-events-auto absolute bottom-3 right-3 flex size-10 items-center justify-center bg-white text-ink shadow-sm transition-colors hover:bg-ink hover:text-white"
      onClick={() => {
        const available = product.variants.filter((variant) => variantInStock(variant));
        if (available.length === 1 && product.variants.length === 1) add(available[0]); else setOpen(true);
      }} title="Agregar al carrito" type="button">
      <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
    </button>}
  </div>;
}
