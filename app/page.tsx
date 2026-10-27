import type { Metadata } from "next";
import { Suspense } from "react";
import LandingSections, { type PublishedLanding } from "./landing-sections";
import type { CatalogProduct } from "./catalogo/catalog-shop";

const apiOrigin = process.env.XPANDER_API_ORIGIN ?? "http://127.0.0.1:8080";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const response = await fetch(`${apiOrigin}/api/landing`, { cache: "no-store" });
    if (response.ok) {
      const landing = (await response.json()) as PublishedLanding;
      return {
        title: landing.seoTitle || landing.title,
        description: landing.seoDescription || "Tienda de ropa XPANDER",
      };
    }
  } catch {
    // Use neutral metadata while the API is unavailable.
  }
  return { title: "XPANDER", description: "Tienda de ropa XPANDER" };
}

async function PublishedHome() {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/api/landing`, { cache: "no-store" });
  } catch {
    return <p className="py-24 text-center text-zinc-600">La tienda no está disponible por el momento.</p>;
  }
  if (response.status === 404) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-28 text-center">
        <p className="text-sm font-medium tracking-[0.3em]">XPANDER</p>
        <h1 className="mt-6 text-5xl font-semibold">Estamos preparando la tienda</h1>
        <p className="mt-5 text-zinc-600">Pronto encontrarás nuestras novedades aquí.</p>
      </div>
    );
  }
  if (!response.ok) {
    return <p className="py-24 text-center text-zinc-600">La tienda no está disponible por el momento.</p>;
  }
  const landing = (await response.json()) as PublishedLanding;
  let featuredProducts: CatalogProduct[] = [];
  if (landing.sections.some((section) => section.type === "featured")) {
    try {
      const productsResponse = await fetch(`${apiOrigin}/api/catalog/products`, { cache: "no-store" });
      if (productsResponse.ok) {
        featuredProducts = ((await productsResponse.json()) as CatalogProduct[])
          .filter((product) => product.isFeatured && product.variants.length > 0);
      }
    } catch { /* Landing remains available if the catalog request fails. */ }
  }
  return <LandingSections featuredProducts={featuredProducts} landing={landing} />;
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <Suspense fallback={<p className="py-24 text-center">Cargando XPANDER…</p>}>
        <PublishedHome />
      </Suspense>
    </main>
  );
}
