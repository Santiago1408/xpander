import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Catálogo | XPANDER",
  description: "Conoce las prendas y variantes de XPANDER en Bolivia.",
};

type CatalogProduct = {
  id: number;
  name: string;
  description: string;
  categoryName: string;
  brandName: string;
  isFeatured: boolean;
  productLabels: string[];
  variants: { id: number; priceMinor: number; optionLabels: string[] }[];
  media: { id: number; url: string; altText: string }[];
};

function money(minor: number): string {
  const whole = Math.floor(minor / 100).toLocaleString("es-BO");
  return `Bs ${whole},${String(minor % 100).padStart(2, "0")}`;
}

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
  return (
    <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => {
        const prices = product.variants.map((variant) => variant.priceMinor);
        const lowest = Math.min(...prices);
        return <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" key={product.id}>
          {product.media[0] ? <Image alt={product.media[0].altText} className="aspect-[4/3] w-full object-cover"
            height={600} src={product.media[0].url} unoptimized width={800} /> :
            <div className="flex aspect-[4/3] items-center justify-center bg-zinc-100 text-sm tracking-[0.25em] text-zinc-400">
              XPANDER
            </div>}
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <span>{product.categoryName}</span>
              {product.brandName && <span>· {product.brandName}</span>}
              {product.isFeatured && <span className="rounded-full bg-zinc-950 px-2 py-1 text-white">Destacado</span>}
            </div>
            <h2 className="mt-3 text-xl font-semibold">{product.name}</h2>
            {product.description && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-zinc-600">{product.description}</p>}
            {product.productLabels.length > 0 && <p className="mt-3 text-sm text-zinc-500">{product.productLabels.join(" · ")}</p>}
            <p className="mt-5 text-lg font-semibold">{prices.length > 1 ? "Desde " : ""}{money(lowest)}</p>
            <ul className="mt-4 space-y-1 text-sm text-zinc-600">
              {product.variants.map((variant) => <li className="flex justify-between gap-3" key={variant.id}>
                <span>{variant.optionLabels.length ? variant.optionLabels.join(" · ") : "Única opción"}</span>
                <span>{money(variant.priceMinor)}</span>
              </li>)}
            </ul>
            <p className="mt-4 text-xs text-zinc-500">Disponibilidad sujeta a confirmación en tienda.</p>
          </div>
        </article>;
      })}
    </div>
  );
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
          <p className="mt-4 max-w-2xl text-zinc-600">Explora nuestras prendas y sus variantes disponibles para consulta.</p>
        </div>
        <Suspense fallback={<p className="text-zinc-600">Cargando productos…</p>}>
          <ProductGrid />
        </Suspense>
      </div>
    </main>
  );
}
