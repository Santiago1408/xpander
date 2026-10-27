import Link from "next/link";
import type { ReactNode } from "react";
import MediaImage from "./media-image";
import ProductCard, { BrandPlaceholder } from "./product-card";
import type { CatalogProduct } from "./catalogo/catalog-shop";
import SiteFooter, { footerContact } from "./site-footer";
import SiteHeader from "./site-header";
import { BenefitIcon } from "./benefit-icons";
import { audienceHref, brandHref, catalogBrands, catalogNav, catalogTerms, styleHref, titleCase } from "./shop-format";

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
  categories?: CategoriesConfig;
  benefits?: BenefitsConfig;
  isVisible?: boolean;
  isDeleted?: boolean;
};

export type BenefitItem = { icon: string; title: string; text: string };
export type BenefitsConfig = { items: BenefitItem[] };

// Starting point for a new benefits section: the automatic strip shown until one exists.
export const defaultBenefits: BenefitItem[] = [
  { icon: "store", title: "Recojo o envío", text: "Retira en la sucursal o pide envío a domicilio; el envío se coordina por WhatsApp." },
  { icon: "qr", title: "Pago por QR", text: "Paga desde la app de tu banco y adjunta tu comprobante." },
  { icon: "chat", title: "Confirmación por WhatsApp", text: "Envías el detalle por WhatsApp y el negocio confirma tu pedido." },
];

export type CategoryTile = { mediaId: number; title: string; linkKind: "" | "style" | "audience" | "brand"; linkValue: string };
export type CategoriesConfig = { layout: "cards" | "panels"; columns: number; tiles: CategoryTile[] };

export type PublishedLanding = {
  title: string;
  seoTitle: string;
  seoDescription: string;
  sections: LandingSection[];
};

export type PublicBusiness = { phone: string; socialLinks: Record<string, string>; qrUrl: string };

const sectionGap = "pt-[clamp(56px,7vw,112px)]";
const bandGap = "mt-[clamp(56px,7vw,112px)]";
const heading = "xp-display m-0 text-[clamp(32px,4vw,56px)] leading-none tracking-[-0.01em] [overflow-wrap:anywhere]";

// Fills the aspect box of its parent; removed images keep a visible marker.
function Picture({ image, sizes, tone = "mist", eager = false }: {
  image?: Pick<LandingMedia, "url" | "altText" | "removed">; sizes: string; tone?: "mist" | "band"; eager?: boolean;
}) {
  if (!image) return <BrandPlaceholder />;
  if (image.removed || !image.url) {
    return <div className={`absolute inset-0 flex items-center justify-center p-6 text-center font-mono text-xs uppercase tracking-[0.08em] ${tone === "band" ? "text-band-muted" : "text-graphite"}`}>
      Imagen eliminada
    </div>;
  }
  return <MediaImage alt={image.altText} className="absolute inset-0 h-full w-full object-cover" height={1200}
    loading={eager ? "eager" : "lazy"} sizes={sizes} src={image.url} width={960} />;
}

function Body({ text, className = "" }: { text: string; className?: string }) {
  return text ? <p className={`m-0 whitespace-pre-line ${className}`}>{text}</p> : null;
}

function CtaLink({ href, children, variant = "dark" }: { href: string; children: ReactNode; variant?: "dark" | "band" | "band-ghost" }) {
  const styles = {
    dark: "bg-ink text-white hover:bg-[#333]",
    band: "bg-band-cta-bg text-band-cta-fg hover:opacity-85",
    "band-ghost": "border border-band-fg text-band-fg hover:bg-band-fg hover:text-band",
  }[variant];
  return <Link className={`xp-btn ${styles}`} href={href}>{children}</Link>;
}

function Hero({ section, title, audiences, first }: { section: LandingSection; title: string; audiences: string[]; first: boolean }) {
  const Title = first ? "h1" : "h2";
  return (
    <section className={`bg-band text-band-fg ${first ? "" : bandGap}`} id={section.key}>
      <div className="xp-container grid items-end gap-[clamp(32px,5vw,72px)] py-[clamp(40px,6vw,80px)] lg:grid-cols-2">
        <div className="flex flex-col gap-8 pb-2">
          <div className="xp-label text-band-muted">XPANDER · Bolivia</div>
          <Title className="xp-display m-0 text-[clamp(52px,8.4vw,136px)] leading-[0.9] tracking-[-0.02em] [overflow-wrap:anywhere]">
            {section.title || title}
          </Title>
          <Body className="max-w-[440px] text-lg leading-[1.55] text-band-body" text={section.body} />
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            {audiences.length > 0 ? <>
              <CtaLink href={audienceHref(audiences[0])} variant="band"><span className="hidden sm:inline">Comprar&nbsp;</span>{titleCase(audiences[0])}</CtaLink>
              <CtaLink href={audiences[1] ? audienceHref(audiences[1]) : "/catalogo"} variant="band-ghost">
                {audiences[1] ? <><span className="hidden sm:inline">Comprar&nbsp;</span>{titleCase(audiences[1])}</> : "Ver catálogo"}
              </CtaLink>
            </> : <CtaLink href="/catalogo" variant="band">Ver catálogo</CtaLink>}
          </div>
        </div>
        <div className="relative -order-1 aspect-[4/5] overflow-hidden bg-band-media lg:order-none">
          <Picture eager={first} image={section.media[0]} sizes="(max-width: 1024px) 100vw, 50vw" tone="band" />
        </div>
      </div>
    </section>
  );
}

// Brands with published products, repeated so the strip loops seamlessly.
function BrandMarquee({ brands }: { brands: string[] }) {
  const repeats = Math.max(2, Math.ceil(12 / brands.length));
  const run = Array.from({ length: repeats }, () => brands).flat();
  const strip = (hidden: boolean) => run.map((brand, index) => <span className="flex items-center gap-12" key={`${hidden}-${index}`}>
    {hidden ? <span>{brand}</span> : <Link className="hover:text-graphite" href={brandHref(brand)} tabIndex={index < brands.length ? 0 : -1}>{brand}</Link>}
    <span aria-hidden="true">✕</span>
  </span>);
  return (
    <nav aria-label="Marcas" className="overflow-hidden border-b border-line py-[18px]">
      <div className="xp-marquee xp-display gap-12 pr-12 text-[15px] tracking-[0.1em]">
        {strip(false)}
        <span aria-hidden="true" className="flex gap-12">{strip(true)}</span>
      </div>
    </nav>
  );
}

function ShopByStyle({ styles, products }: { styles: string[]; products: CatalogProduct[] }) {
  return (
    <section className={`xp-container ${sectionGap}`}>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <h2 className={heading}>Compra por estilo</h2>
        <p className="m-0 max-w-[360px] text-[15px] leading-relaxed text-graphite">Elige una línea y mira todas sus prendas disponibles.</p>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0">
        {styles.map((style, index) => {
          const image = products.find((product) => product.style === style && product.media[0])?.media[0];
          return <Link className="xp-card flex w-[78%] shrink-0 snap-start flex-col gap-4 text-ink sm:w-auto" href={styleHref(style)} key={style}>
            <div className="relative aspect-[4/5] overflow-hidden bg-mist">
              <Picture image={image} sizes="(max-width: 768px) 100vw, 33vw" />
            </div>
            <div className="flex items-baseline justify-between border-t border-ink pt-3.5">
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-xs text-graphite">{String(index + 1).padStart(2, "0")}</span>
                <span className="xp-display text-[22px]">{style}</span>
              </div>
              <span className="text-[13px] font-medium">Ver todo →</span>
            </div>
          </Link>;
        })}
      </div>
    </section>
  );
}

export function categoryHref(tile: CategoryTile): string | null {
  if (!tile.linkKind || !tile.linkValue) return null;
  return tile.linkKind === "style" ? styleHref(tile.linkValue) : tile.linkKind === "audience" ? audienceHref(tile.linkValue) : brandHref(tile.linkValue);
}

// Large image blocks chosen by the owner, each with its own image, text and link.
function Categories({ section }: { section: LandingSection }) {
  const config = section.categories ?? { layout: "cards", columns: 2, tiles: [] };
  const columns = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3" }[config.columns] ?? "md:grid-cols-2";
  const sizes = `(max-width: 768px) 100vw, ${Math.round(100 / Math.max(1, config.columns))}vw`;
  const mediaFor = (tile: CategoryTile) => section.media.find((item) => item.id === tile.mediaId);
  return (
    <section className={`xp-container ${sectionGap}`} id={section.key}>
      {(section.title || section.body) && <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        {section.title && <h2 className={heading}>{section.title}</h2>}
        <Body className="max-w-[360px] text-[15px] leading-relaxed text-graphite" text={section.body} />
      </div>}
      <div className={`grid gap-5 ${config.layout === "panels" && config.columns > 1 ? "grid-cols-2" : "grid-cols-1"} ${columns}`}>
        {config.tiles.map((tile, index) => {
          const href = categoryHref(tile);
          const image = mediaFor(tile);
          if (config.layout === "panels") {
            const panel = <div className={`relative overflow-hidden ${config.columns === 1 ? "aspect-[16/9]" : "aspect-[5/6]"} ${index % 2 ? "bg-[#e4e4e4]" : "bg-mist"}`}>
              <Picture image={image} sizes={sizes} />
              {(tile.title || href) && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />}
              <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 md:inset-x-6 md:bottom-6">
                {tile.title && <span className="xp-display text-[clamp(18px,4vw,64px)] leading-none text-white [text-shadow:0_1px_24px_rgba(0,0,0,.35)]">{tile.title}</span>}
                {href && <span className="hidden text-sm font-semibold text-white underline underline-offset-4 [text-shadow:0_1px_12px_rgba(0,0,0,.4)] sm:inline">Comprar</span>}
              </div>
            </div>;
            return href ? <Link className="xp-card" href={href} key={index}>{panel}</Link> : <div key={index}>{panel}</div>;
          }
          const card = <>
            <div className="relative aspect-[4/5] overflow-hidden bg-mist"><Picture image={image} sizes={sizes} /></div>
            <div className="flex items-baseline justify-between border-t border-ink pt-3.5">
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-xs text-graphite">{String(index + 1).padStart(2, "0")}</span>
                {tile.title && <span className="xp-display text-[22px]">{tile.title}</span>}
              </div>
              {href && <span className="text-[13px] font-medium">Ver todo →</span>}
            </div>
          </>;
          return href ? <Link className="xp-card flex flex-col gap-4 text-ink" href={href} key={index}>{card}</Link> :
            <div className="flex flex-col gap-4" key={index}>{card}</div>;
        })}
      </div>
    </section>
  );
}

function Featured({ section, products }: { section: LandingSection; products: CatalogProduct[] }) {
  return (
    <section className={`xp-container ${sectionGap}`} id={section.key}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <h2 className={heading}>{section.title || "Productos destacados"}</h2>
        <Link className="text-sm font-medium underline underline-offset-4" href="/catalogo">Ver todo el catálogo</Link>
      </div>
      <Body className="-mt-4 mb-8 max-w-2xl leading-relaxed text-graphite" text={section.body} />
      {products.length === 0 ? <p className="border border-dashed border-line p-10 text-graphite">Aún no hay productos destacados.</p> :
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] sm:gap-x-5">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>}
    </section>
  );
}

function Editorial({ section }: { section: LandingSection }) {
  const [lead, ...rest] = section.media;
  const text = <div className="flex max-w-[520px] flex-col gap-6">
    {section.title && <h2 className="xp-display m-0 text-[clamp(36px,4.4vw,64px)] leading-[0.98] tracking-[-0.01em]">{section.title}</h2>}
    <Body className="text-[17px] leading-[1.65] text-body" text={section.body} />
    <CtaLink href="/catalogo">Ver catálogo</CtaLink>
  </div>;
  return (
    <section className={`xp-container ${sectionGap}`} id={section.key}>
      {lead ? <div className="grid items-center gap-[clamp(32px,5vw,80px)] lg:grid-cols-2">
        <div className="relative aspect-square overflow-hidden bg-mist">
          <Picture image={lead} sizes="(max-width: 1024px) 100vw, 50vw" />
        </div>
        {text}
      </div> : <div className="border-t border-ink pt-10">{text}</div>}
      {rest.length > 0 && <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5">
        {rest.map((image) => <div className="relative aspect-[4/5] overflow-hidden bg-mist" key={image.id}>
          <Picture image={image} sizes="(max-width: 768px) 100vw, 33vw" />
        </div>)}
      </div>}
    </section>
  );
}

function Gallery({ section }: { section: LandingSection }) {
  const pair = section.media.length === 2;
  return (
    <section className={`xp-container ${sectionGap}`} id={section.key}>
      {(section.title || section.body) && <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        {section.title && <h2 className={heading}>{section.title}</h2>}
        <Body className="max-w-[360px] text-[15px] leading-relaxed text-graphite" text={section.body} />
      </div>}
      {pair ? <div className="grid grid-cols-2 gap-3 md:gap-5">
        {section.media.map((image, index) => <div className={`relative aspect-[5/6] overflow-hidden ${index ? "bg-[#e4e4e4]" : "bg-mist"}`} key={image.id}>
          <Picture image={image} sizes="(max-width: 768px) 100vw, 50vw" />
          {image.altText && !image.removed && <span className="xp-display absolute inset-x-3 bottom-3 text-[clamp(18px,4vw,64px)] md:inset-x-6 md:bottom-6 leading-none text-white [text-shadow:0_1px_24px_rgba(0,0,0,.35)]">{image.altText}</span>}
        </div>)}
      </div> : <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] sm:gap-5">
        {section.media.map((image, index) => <figure className="m-0 flex flex-col gap-4" key={image.id}>
          <div className="relative aspect-[4/5] overflow-hidden bg-mist">
            <Picture image={image} sizes="(max-width: 768px) 100vw, 33vw" />
          </div>
          {image.altText && !image.removed && <figcaption className="flex items-baseline gap-4 border-t border-ink pt-3.5">
            <span className="font-mono text-xs text-graphite">{String(index + 1).padStart(2, "0")}</span>
            <span className="text-[15px] font-medium">{image.altText}</span>
          </figcaption>}
        </figure>)}
      </div>}
    </section>
  );
}

function Video({ section }: { section: LandingSection }) {
  return (
    <section className={`bg-band text-band-fg ${bandGap}`} id={section.key}>
      <div className="xp-container flex flex-col gap-12 py-[clamp(56px,7vw,104px)]">
        <div className="flex max-w-[720px] flex-col gap-5">
          <div className="xp-label text-band-muted">XPANDER · Video</div>
          {section.title && <h2 className="xp-display m-0 text-[clamp(40px,6vw,96px)] leading-[0.92] tracking-[-0.02em]">{section.title}</h2>}
          <Body className="max-w-[520px] text-[17px] leading-relaxed text-band-body" text={section.body} />
        </div>
        {section.video?.embedUrl ? <iframe allowFullScreen className="aspect-video w-full border border-band-line"
          loading="lazy" referrerPolicy="strict-origin-when-cross-origin" src={section.video.embedUrl}
          title={section.title || "Video de XPANDER"} /> :
          <p className="border border-dashed border-band-line p-8 text-band-muted">Agrega y guarda el enlace del video para previsualizarlo.</p>}
      </div>
    </section>
  );
}

function Benefits({ items, section }: { items: BenefitItem[]; section?: LandingSection }) {
  return (
    <section className={`xp-container ${sectionGap} ${section ? "" : "pb-[clamp(56px,7vw,112px)]"}`} id={section?.key}>
      {section && (section.title || section.body) && <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        {section.title && <h2 className={heading}>{section.title}</h2>}
        <Body className="max-w-[360px] text-[15px] leading-relaxed text-graphite" text={section.body} />
      </div>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] border-y border-b-line border-t-ink">
        {items.map((item, index) => <div className="flex flex-col gap-3.5 py-8 pr-6" key={index}>
          <BenefitIcon icon={item.icon} />
          {item.title && <span className="text-base font-semibold">{item.title}</span>}
          {item.text && <span className="text-sm leading-[1.55] text-graphite">{item.text}</span>}
        </div>)}
      </div>
    </section>
  );
}

export default function LandingSections({ landing, products = [], business }: {
  landing: PublishedLanding; products?: CatalogProduct[]; business?: PublicBusiness;
}) {
  const visible = landing.sections.filter(
    (section) => section.isVisible !== false && section.isDeleted !== true,
  );
  // The contact section is always rendered last, as the page footer.
  const contactSection = footerContact(visible);
  const sections = visible.filter((section) => section.type !== "contact");
  const featuredProducts = products.filter((product) => product.isFeatured && product.variants.length > 0);
  const { audiences, styles } = catalogTerms(products);
  const nav = catalogNav(products);
  const brands = catalogBrands(products);
  // Owner-made image blocks replace the automatic "Compra por estilo" block.
  const hasCategories = sections.some((section) => section.type === "categories");
  // An editable benefits section replaces the automatic strip before the footer.
  const hasBenefits = sections.some((section) => section.type === "benefits");
  const styleBlocks = styles.filter((style) => products.some((product) => product.style === style));
  // The catalog-driven blocks follow the first section, normally the cover.
  const extrasAfter = 0;
  let heroCount = 0;

  return (
    <>
      <SiteHeader nav={nav} />
      {sections.length === 0 && !contactSection && (
        <section className="bg-band text-band-fg">
          <div className="xp-container py-28">
            <h1 className="xp-display m-0 text-[clamp(52px,8vw,128px)] leading-[0.9]">{landing.title}</h1>
          </div>
        </section>
      )}
      {sections.map((section, index) => {
        let block: ReactNode;
        if (section.type === "hero") block = <Hero audiences={audiences} first={heroCount++ === 0} section={section} title={landing.title} />;
        else if (section.type === "featured") block = <Featured products={featuredProducts} section={section} />;
        else if (section.type === "gallery") block = <Gallery section={section} />;
        else if (section.type === "video") block = <Video section={section} />;
        else if (section.type === "benefits") block = <Benefits items={section.benefits?.items ?? []} section={section} />;
        else if (section.type === "categories") block = <Categories section={section} />;
        else block = <Editorial section={section} />;
        return <div key={section.key}>
          {block}
          {index === extrasAfter && <>
            {brands.length > 0 && <BrandMarquee brands={brands} />}
            {styleBlocks.length > 1 && !hasCategories && <ShopByStyle products={products} styles={styleBlocks} />}
          </>}
        </div>;
      })}
      {hasBenefits ? <div className="pb-[clamp(56px,7vw,112px)]" /> : <Benefits items={defaultBenefits.map((item) => item.icon === "qr" && !business?.qrUrl && business ?
        { ...item, text: "El pago en línea no está disponible por el momento." } : item)} />}
      <SiteFooter contact={contactSection} phone={business?.phone} socialLinks={business?.socialLinks} />
    </>
  );
}
