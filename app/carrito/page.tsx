import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fetchCatalog } from "../store-data";
import CheckoutFlow from "../checkout-flow";

export const metadata: Metadata = {
  title: "Carrito | XPANDER",
  description: "Revisa tu carrito, elige recojo o envío y paga con QR.",
};

async function CartContent() {
  const products = await fetchCatalog();
  if (!products) {
    return <div className="xp-container py-24">
      <p className="border border-dashed border-line p-12 text-center text-graphite">El carrito no está disponible por el momento.</p>
    </div>;
  }
  return <div className="xp-container max-w-[880px] pb-24 pt-8"><CheckoutFlow layout="page" products={products} /></div>;
}

export default function CartPage() {
  return <>
    <header className="border-b border-line bg-white text-ink">
      <div className="xp-container grid min-h-[72px] grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Link className="text-sm font-medium hover:text-graphite" href="/catalogo">← <span className="hidden sm:inline">Seguir comprando</span></Link>
        <Link aria-label="XPANDER, ir al inicio" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img alt="XPANDER" className="h-[18px] w-auto md:h-6" src="/brand/xpander-wordmark.png" />
        </Link>
        <span className="justify-self-end font-mono text-xs text-graphite">Pago por QR</span>
      </div>
    </header>
    <main className="flex-1 bg-white text-ink">
      <Suspense fallback={<p className="py-24 text-center font-mono text-xs uppercase tracking-[0.12em] text-graphite">Cargando carrito…</p>}>
        <CartContent />
      </Suspense>
    </main>
  </>;
}
