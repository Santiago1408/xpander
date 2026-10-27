import type { Metadata } from "next";
import { Suspense } from "react";
import CatalogShop from "./catalog-shop";
import { catalogNav } from "../shop-format";
import SiteFooter, { footerContact } from "../site-footer";
import SiteHeader from "../site-header";
import { fetchBusiness, fetchCatalog, fetchLanding } from "../store-data";

export const metadata: Metadata = {
  title: "Catálogo | XPANDER",
  description: "Conoce las prendas y variantes de XPANDER en Bolivia.",
};

function Message({ text }: { text: string }) {
  return <div className="xp-container py-24">
    <p className="border border-dashed border-line p-12 text-center text-graphite">{text}</p>
  </div>;
}

async function Catalog() {
  const [products, business, landing] = await Promise.all([fetchCatalog(), fetchBusiness(), fetchLanding()]);
  const nav = catalogNav(products ?? []);
  return <>
    <SiteHeader activeHref="/catalogo" nav={nav} />
    <main className="flex-1 bg-white text-ink">
      {!products ? <Message text="El catálogo no está disponible por el momento." /> :
        products.length === 0 ? <Message text="Aún no hay productos publicados. Vuelve pronto para conocer las novedades." /> :
          <CatalogShop products={products} />}
    </main>
    <SiteFooter contact={footerContact(landing?.sections)} phone={business?.phone} socialLinks={business?.socialLinks} />
  </>;
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<p className="py-24 text-center font-mono text-xs uppercase tracking-[0.12em] text-graphite">Cargando catálogo…</p>}>
      <Catalog />
    </Suspense>
  );
}
