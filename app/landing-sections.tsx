import Link from "next/link";
import SocialLinks from "./social-links";
import MediaImage from "./media-image";
import type { CatalogProduct } from "./catalogo/catalog-shop";

export type LandingMedia = {
  id: number;
  kind: string;
  url: string;
  altText: string;
  removed?: boolean;
};

export type LandingSection = {
  key: string;
  type: string;
  title: string;
  body: string;
  media: LandingMedia[];
  contact?: { socialLinks?: Record<string, string>; mapUrl?: string; mapEmbedUrl?: string };
  video?: { url?: string; embedUrl?: string };
  isVisible?: boolean;
  isDeleted?: boolean;
};

export type PublishedLanding = {
  title: string;
  seoTitle: string;
  seoDescription: string;
  sections: LandingSection[];
};

function Picture({ image, wide = false }: { image: LandingMedia; wide?: boolean }) {
  if (image.removed || !image.url) {
    return <div className={`flex items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-100 p-8 text-center text-sm text-zinc-500 ${wide ? "min-h-64" : "aspect-[4/3]"}`}>
      Imagen eliminada
    </div>;
  }
  return (
    <MediaImage
      alt={image.altText}
      className={`w-full rounded-xl object-cover ${wide ? "max-h-[34rem]" : "aspect-[4/3]"}`}
      height={wide ? 900 : 600}
      sizes={wide ? "(max-width: 1024px) 100vw, 50vw" : "(max-width: 640px) 100vw, 50vw"}
      src={image.url}
      width={wide ? 1600 : 800}
    />
  );
}

function mapDestination(embedUrl: string): string {
  const coordinates = /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/.exec(embedUrl);
  if (!coordinates) return embedUrl;
  const longitude = Number(coordinates[1]);
  const latitude = Number(coordinates[2]);
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return embedUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function priceBOB(minor: number): string {
  const whole = Math.floor(minor / 100).toLocaleString("es-BO");
  return `Bs ${whole},${String(minor % 100).padStart(2, "0")}`;
}

export default function LandingSections({ landing, featuredProducts = [] }: {
  landing: PublishedLanding; featuredProducts?: CatalogProduct[];
}) {
  const sections = landing.sections.filter(
    (section) => section.isVisible !== false && section.isDeleted !== true,
  );
  const mapUrl = sections.find((section) => section.type === "contact" &&
    (section.contact?.mapUrl || section.contact?.mapEmbedUrl))?.contact;
  const embedUrl = mapUrl?.mapEmbedUrl || mapUrl?.mapUrl;
  return (
    <>
      <header className="border-b border-zinc-200 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5">
          <Link className="text-xl font-semibold tracking-[0.22em]" href="/">
            XPANDER
          </Link>
          <nav aria-label="Secciones" className="flex flex-wrap gap-5 text-sm">
            <Link className="text-zinc-600 hover:text-zinc-950" href="/catalogo">Catálogo</Link>
            {sections.map((section) => (
              <a className="text-zinc-600 hover:text-zinc-950" href={`#${section.key}`} key={section.key}>
                {section.title || "Sección"}
              </a>
            ))}
          </nav>
        </div>
      </header>
      {sections.length === 0 && (
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h1 className="text-5xl font-semibold">{landing.title}</h1>
        </div>
      )}
      {sections.map((section) => {
        if (section.type === "hero") {
          return (
            <section className="mx-auto max-w-6xl px-6 py-16" id={section.key} key={section.key}>
              <div className="grid items-center gap-10 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold tracking-[0.3em]">XPANDER</p>
                  <h1 className="mt-5 text-5xl font-semibold leading-tight md:text-7xl">
                    {section.title || landing.title}
                  </h1>
                  {section.body && <p className="mt-6 whitespace-pre-line text-lg text-zinc-600">{section.body}</p>}
                </div>
                {section.media[0] && <Picture image={section.media[0]} wide />}
              </div>
            </section>
          );
        }
        if (section.type === "gallery") {
          return (
            <section className="bg-zinc-50 px-6 py-16" id={section.key} key={section.key}>
              <div className="mx-auto max-w-6xl">
                <h2 className="text-3xl font-semibold">{section.title}</h2>
                {section.body && <p className="mt-4 whitespace-pre-line text-zinc-600">{section.body}</p>}
                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.media.map((image) => <Picture image={image} key={image.id} />)}
                </div>
              </div>
            </section>
          );
        }
        if (section.type === "video") {
          return <section className="mx-auto max-w-4xl px-6 py-16" id={section.key} key={section.key}>
            <h2 className="text-3xl font-semibold">{section.title}</h2>
            {section.body && <p className="mt-4 whitespace-pre-line text-zinc-600">{section.body}</p>}
            {section.video?.embedUrl ? <iframe allowFullScreen className="mt-8 aspect-video w-full rounded-xl"
              loading="lazy" referrerPolicy="strict-origin-when-cross-origin" src={section.video.embedUrl}
              title={section.title || "Video de XPANDER"} /> :
              <p className="mt-6 rounded-xl border border-dashed p-8 text-zinc-500">Agrega y guarda el enlace del video para previsualizarlo.</p>}
          </section>;
        }
        if (section.type === "featured") {
          return <section className="bg-zinc-50 px-6 py-16" id={section.key} key={section.key}>
            <div className="mx-auto max-w-6xl">
              <h2 className="text-3xl font-semibold">{section.title || "Productos destacados"}</h2>
              {section.body && <p className="mt-4 whitespace-pre-line text-zinc-600">{section.body}</p>}
              {featuredProducts.length === 0 ? <p className="mt-8 text-zinc-500">Aún no hay productos destacados.</p> :
                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {featuredProducts.map((product) => <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white" key={product.id}>
                    {product.media[0] ? <MediaImage alt={product.media[0].altText} className="aspect-[4/3] w-full object-cover"
                      height={600} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      src={product.media[0].url} width={800} /> :
                      <div className="flex aspect-[4/3] items-center justify-center bg-zinc-100 text-zinc-400">XPANDER</div>}
                    <div className="p-5">
                      <h3 className="text-lg font-semibold">{product.name}</h3>
                      <p className="mt-1 text-sm text-zinc-500">{product.variants.length > 1 ? "Desde " : ""}
                        {priceBOB(Math.min(...product.variants.map((variant) => variant.priceMinor)))}</p>
                      <Link className="mt-4 inline-block text-sm font-medium underline" href={`/catalogo#producto-${product.id}`}>
                        Ver en catálogo
                      </Link>
                    </div>
                  </article>)}
                </div>}
            </div>
          </section>;
        }
        if (section.type === "contact") {
          return (
            <section className="mx-auto max-w-4xl px-6 py-16" id={section.key} key={section.key}>
              <h2 className="text-3xl font-semibold">{section.title}</h2>
              {section.body && <p className="mt-5 whitespace-pre-line leading-8 text-zinc-600">{section.body}</p>}
              <div className="mt-6"><SocialLinks links={section.contact?.socialLinks} /></div>
              {section.media.length > 0 && <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {section.media.map((image) => <Picture image={image} key={image.id} />)}
              </div>}
            </section>
          );
        }
        return (
          <section className="mx-auto max-w-4xl px-6 py-16" id={section.key} key={section.key}>
            <h2 className="text-3xl font-semibold">{section.title}</h2>
            {section.body && <p className="mt-5 whitespace-pre-line leading-8 text-zinc-600">{section.body}</p>}
            {section.media.length > 0 && (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {section.media.map((image) => <Picture image={image} key={image.id} />)}
              </div>
            )}
          </section>
        );
      })}
      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-sm text-zinc-500">
        {embedUrl && <div className="relative mx-auto mb-8 max-w-4xl overflow-hidden rounded-xl border border-zinc-200">
          <iframe className="h-72 w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
            src={embedUrl} title="Ubicación de la tienda" />
          <a aria-label="Abrir ubicación de la tienda en Google Maps" className="absolute inset-0"
            href={mapDestination(embedUrl)} rel="noopener noreferrer" target="_blank" />
        </div>}
        XPANDER · Bolivia
      </footer>
    </>
  );
}
