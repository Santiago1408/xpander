import type { Metadata } from "next";
import { Suspense } from "react";
import LandingSections, { type PublishedLanding } from "./landing-sections";
import { apiOrigin, fetchBusiness, fetchCatalog } from "./store-data";

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

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col bg-band text-band-fg">
      <div className="xp-container flex flex-1 flex-col justify-center gap-6 py-28">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img alt="XPANDER" className="xp-logo-band h-6 w-auto self-start" src="/api/brand/logotipo" />
        <h1 className="xp-display m-0 max-w-5xl text-[clamp(44px,7vw,112px)] leading-[0.92] tracking-[-0.02em]">{title}</h1>
        <p className="m-0 max-w-md text-lg text-band-body">{text}</p>
      </div>
    </div>
  );
}

async function PublishedHome() {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/api/landing`, { cache: "no-store" });
  } catch {
    return <Notice text="Vuelve a intentarlo en unos minutos." title="La tienda no está disponible por el momento" />;
  }
  if (response.status === 404) {
    return <Notice text="Pronto encontrarás nuestras novedades aquí." title="Estamos preparando la tienda" />;
  }
  if (!response.ok) {
    return <Notice text="Vuelve a intentarlo en unos minutos." title="La tienda no está disponible por el momento" />;
  }
  const landing = (await response.json()) as PublishedLanding;
  // The landing remains available if the catalog or business data cannot be read.
  const [products, business] = await Promise.all([fetchCatalog(), fetchBusiness()]);
  return <LandingSections business={business} landing={landing} products={products ?? []} />;
}

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-white text-ink">
      <Suspense fallback={<p className="py-24 text-center font-mono text-xs uppercase tracking-[0.12em] text-graphite">Cargando XPANDER…</p>}>
        <PublishedHome />
      </Suspense>
    </main>
  );
}
