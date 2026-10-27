"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cartOpenEvent, openCart, useCartCount } from "./cart-store";
import type { CatalogProduct } from "./catalogo/catalog-shop";
import CheckoutFlow from "./checkout-flow";

// Floating cart button plus the right-hand checkout drawer used across the store.
export default function CartDrawer() {
  const pathname = usePathname();
  const count = useCartCount();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function show() { setOpen(true); }
    window.addEventListener(cartOpenEvent, show);
    return () => window.removeEventListener(cartOpenEvent, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    function close(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", close);
    if (!products) {
      void fetch("/api/catalog/products", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error();
        setProducts((await response.json()) as CatalogProduct[]);
      }).catch(() => setLoadError("No se pudo cargar el carrito. Inténtalo de nuevo."));
    }
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [open, products]);

  if (pathname === "/carrito") return null;

  return <>
    {!open && <button aria-label={`Abrir carrito, ${count} ${count === 1 ? "unidad" : "unidades"}`}
      className="fixed bottom-5 right-5 z-40 flex size-16 items-center justify-center rounded-full bg-ink text-white shadow-[0_8px_30px_rgba(0,0,0,.25)] transition-transform hover:scale-105 sm:bottom-8 sm:right-8"
      onClick={openCart} type="button">
      <svg aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink bg-white px-1 font-mono text-[11px] text-ink">{count}</span>}
    </button>}
    {open && <div className="fixed inset-0 z-50 flex justify-end bg-ink/50" onClick={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }} role="presentation">
      <div aria-label="Carrito de compras" aria-modal="true" className="flex h-full w-full max-w-[480px] flex-col bg-white text-ink shadow-2xl outline-none"
        ref={panel} role="dialog" tabIndex={-1}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-7">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-graphite">XPANDER · Compra</span>
          <button aria-label="Cerrar carrito" className="inline-flex size-10 items-center justify-center border border-line hover:border-ink" onClick={() => setOpen(false)} type="button">
            <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {products ? <CheckoutFlow layout="drawer" onClose={() => setOpen(false)} products={products} /> :
            <p className="text-sm text-graphite" role={loadError ? "alert" : undefined}>{loadError || "Cargando carrito…"}</p>}
        </div>
      </div>
    </div>}
  </>;
}
