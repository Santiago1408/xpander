import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import CatalogShop, { type CatalogProduct } from "./catalog-shop";

export const metadata: Metadata = {
  title: "Catálogo | XPANDER",
  description: "Conoce las prendas y variantes de XPANDER en Bolivia.",
};

async function ProductGrid() {
  const apiOrigin = process.env.XPANDER_API_ORIGIN ?? "http://127.0.0.1:8080";
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/api/catalog/products`, { cache: "no-store" });
  } catch {
    return <p className="text-zinc-600">El catálogo no está disponible por el momento.</p>;
  }
  if (!response.ok) return <p className="text-zinc-600">El catálogo no está disponible por el momento.</p>;
  const products = (await response.json()) as CatalogProduct[];
  if (products.length === 0) {
    return <p className="rounded-xl border border-dashed border-zinc-300 p-10 text-zinc-600">
      Aún no hay productos publicados. Vuelve pronto para conocer las novedades.
    </p>;
  }
  return <CatalogShop products={products} />;
}

export default function CatalogPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-7">
          <Link className="text-xl font-semibold tracking-[0.22em]" href="/">XPANDER</Link>
          <Link className="text-sm text-zinc-600 hover:text-zinc-950" href="/">Volver al inicio</Link>
        </header>
        <div className="py-12">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-zinc-500">Ropa casual y deportiva</p>
          <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Catálogo</h1>
          <p className="mt-4 max-w-2xl text-zinc-600">Elige tus prendas y solicita el recojo en tienda. El pedido queda registrado antes de abrir WhatsApp.</p>
        </div>
        <Suspense fallback={<p className="text-zinc-600">Cargando productos…</p>}>
          <ProductGrid />
        </Suspense>
      </div>
    </main>
  );
}
