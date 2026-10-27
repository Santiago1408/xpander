import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ProductCard from "../../product-card";
import { catalogNav, formatBOB, hasPriceRange, lowestPrice, productHref, sizeLabel, styleHref, titleCase } from "../../shop-format";
import SiteFooter, { footerContact } from "../../site-footer";
import SiteHeader from "../../site-header";
import { fetchBusiness, fetchCatalog, fetchLanding } from "../../store-data";
import ProductDetail from "./product-detail";

export async function generateMetadata({ params }: PageProps<"/catalogo/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const products = await fetchCatalog();
  const product = products?.find((item) => item.slug === slug);
  // A slug that is not in the catalog answers 404 (also for search engines).
  if (products && !product) notFound();
  if (!product) return { title: "Producto | XPANDER" };
  const name = titleCase(product.name);
  const price = `${hasPriceRange(product) ? "Desde " : ""}${formatBOB(lowestPrice(product))}`;
  const sizes = product.variants.map(sizeLabel).filter(Boolean).join(", ");
  const description = product.description.trim().slice(0, 200) ||
    [`${name}${product.color ? ` color ${product.color.toLocaleLowerCase("es-BO")}` : ""}`, price, sizes && `Tallas ${sizes}`].filter(Boolean).join(" · ");
  const photo = product.media[0];
  return {
    title: `${name} | XPANDER`, description,
    alternates: { canonical: productHref(product) },
    // The product photo first; the store image is a fallback for apps that skip WebP.
    openGraph: { siteName: "XPANDER", locale: "es_BO", type: "website", url: productHref(product), title: `${name} · ${price}`, description,
      images: [...(photo ? [{ url: `${photo.url}?size=card`, alt: photo.altText || name }] : []), { url: "/imagen-compartir", width: 1200, height: 630, alt: "XPANDER" }] },
  };
}

async function Product({ params }: { params: PageProps<"/catalogo/[slug]">["params"] }) {
  const { slug } = await params;
  const [products, business, landing] = await Promise.all([fetchCatalog(), fetchBusiness(), fetchLanding()]);
  const product = products?.find((item) => item.slug === slug);
  if (!products || !product) notFound();
  const nav = catalogNav(products);
  // Each color is registered as its own product with the same name.
  const siblings = products.filter((item) => item.id !== product.id && item.name === product.name && item.color);
  const related = products.filter((item) => item.id !== product.id && item.name !== product.name &&
    ((product.style && item.style === product.style) || (product.audience && item.audience === product.audience))).slice(0, 4);
  const crumb = product.audience || product.style;

  return <>
    <SiteHeader nav={nav} />
    <main className="flex-1 bg-white pb-24 text-ink">
      <nav aria-label="Ruta" className="xp-container flex flex-wrap gap-2 pt-8 font-mono text-xs text-graphite">
        <Link className="hover:text-ink" href="/">Inicio</Link><span>/</span>
        <Link className="hover:text-ink" href="/catalogo">Catálogo</Link><span>/</span>
        {crumb && <><Link className="hover:text-ink" href={product.audience ? `/catalogo?publico=${encodeURIComponent(product.audience)}` : styleHref(product.style)}>{titleCase(crumb)}</Link><span>/</span></>}
        <span className="text-ink">{titleCase(product.name)}</span>
      </nav>
      <ProductDetail knownVariantIds={products.flatMap((item) => item.variants.map((variant) => variant.id))}
        product={product} qrAvailable={Boolean(business?.qrUrl)} siblings={siblings} />
      {related.length > 0 && <section className="xp-container pt-[clamp(56px,7vw,112px)]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6 border-t border-ink pt-4">
          <h2 className="xp-display m-0 text-[clamp(32px,4vw,56px)] leading-none tracking-[-0.01em]">Completa el look</h2>
          {product.style && <Link className="text-sm font-medium underline underline-offset-4" href={styleHref(product.style)}>Ver más de {titleCase(product.style)}</Link>}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-x-5">
          {related.map((item) => <ProductCard key={item.id} product={item} />)}
        </div>
      </section>}
    </main>
    <SiteFooter contact={footerContact(landing?.sections)} phone={business?.phone} socialLinks={business?.socialLinks} />
  </>;
}

export default function ProductPage({ params }: PageProps<"/catalogo/[slug]">) {
  return (
    <Suspense fallback={<p className="py-24 text-center font-mono text-xs uppercase tracking-[0.12em] text-graphite">Cargando producto…</p>}>
      <Product params={params} />
    </Suspense>
  );
}
