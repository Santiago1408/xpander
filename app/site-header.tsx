"use client";

import Link from "next/link";
import { useState } from "react";
import CartDrawer from "./cart-drawer";
import { openCart, useCartCount } from "./cart-store";
import type { NavItem } from "./shop-format";
import ThemeToggle from "./theme-toggle";

export const announcement = "Recojo en tienda o envío · Pago por QR";

export default function SiteHeader({ nav, activeHref }: { nav: NavItem[]; activeHref?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const count = useCartCount();
  const links = [{ label: "Catálogo", href: "/catalogo" }, ...nav];

  return <>
    <div className="bg-ink px-4 py-2.5 text-center font-mono text-xs uppercase tracking-[0.08em] text-white">{announcement}</div>
    <header className="relative z-30 border-b border-line bg-white text-ink">
      <div className="xp-container flex min-h-16 items-center gap-6 md:min-h-[76px]">
        <nav aria-label="Principal" className="flex flex-1 items-center gap-2">
          <button aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            className="-ml-3 inline-flex size-11 items-center justify-center md:hidden" onClick={() => setMenuOpen(!menuOpen)} type="button">
            <svg aria-hidden="true" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              {menuOpen ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M3 7h18M3 12h18M3 17h18" />}
            </svg>
          </button>
          <div className="hidden flex-wrap gap-7 text-sm font-medium md:flex">
            {links.map((item) => <Link className={`underline-offset-[6px] hover:text-graphite ${activeHref === item.href ? "underline" : ""}`}
              href={item.href} key={item.href}>{item.label}</Link>)}
          </div>
        </nav>
        <Link aria-label="XPANDER, ir al inicio" className="shrink-0" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img alt="XPANDER" className="h-[18px] w-auto md:h-[22px]" src="/brand/xpander-wordmark.png" />
        </Link>
        <div className="flex flex-1 items-center justify-end gap-0.5">
          <Link aria-label="Buscar en el catálogo" className="hidden size-11 items-center justify-center sm:inline-flex" href="/catalogo#buscar">
            <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          </Link>
          <Link aria-label="Acceso de administración" className="inline-flex size-11 items-center justify-center" href="/admin" title="Administración">
            <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
          </Link>
          <ThemeToggle />
          <button aria-label={`Abrir carrito, ${count} unidades`} className="relative inline-flex size-11 items-center justify-center" onClick={openCart} type="button">
            <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
            {count > 0 && <span className="absolute right-1 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 font-mono text-[10px] text-white">{count}</span>}
          </button>
        </div>
      </div>
      {menuOpen && <div className="absolute inset-x-0 top-full border-b border-line bg-white md:hidden">
        <nav aria-label="Menú móvil" className="xp-container flex flex-col py-2">
          {links.map((item) => <Link className="xp-display border-b border-line py-4 text-xl" href={item.href} key={item.href}
            onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
          <Link className="flex items-center justify-between py-4 text-sm font-medium" href="/admin" onClick={() => setMenuOpen(false)}>
            Acceso de administración <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </div>}
    </header>
    <CartDrawer />
  </>;
}
