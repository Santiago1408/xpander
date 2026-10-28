import Link from "next/link";
import FitTitle from "./fit-title";
import type { LandingSection } from "./landing-sections";
import MediaImage from "./media-image";
import { siteDesigner } from "./site-credits";
import { whatsappHref } from "./shop-format";
import SocialLinks from "./social-links";

export function mapDestination(embedUrl: string): string {
  const coordinates = /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/.exec(embedUrl);
  if (!coordinates) return embedUrl;
  const longitude = Number(coordinates[1]);
  const latitude = Number(coordinates[2]);
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return embedUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

// The landing's contact section is shown as the footer of every storefront page.
export function footerContact(sections: LandingSection[] = []): LandingSection | undefined {
  return sections.find((section) => section.type === "contact" && section.isVisible !== false && section.isDeleted !== true);
}

export default function SiteFooter({ contact, phone = "", socialLinks = {} }: {
  contact?: LandingSection; phone?: string; socialLinks?: Record<string, string>;
}) {
  // Business links first, the section's own links on top, and WhatsApp from the phone when none is set.
  const links: Record<string, string> = { ...socialLinks };
  for (const [key, value] of Object.entries(contact?.contact?.socialLinks || {})) if (value) links[key] = value;
  const whatsapp = links.whatsapp || whatsappHref(phone);
  if (whatsapp) links.whatsapp = whatsapp;
  const map = contact?.contact?.mapEmbedUrl || contact?.contact?.mapUrl || "";
  const body = contact?.body?.trim() || "";
  const media = contact?.media ?? [];

  return (
    <footer className="mt-auto bg-ink text-white" id={contact?.key || "contacto"}>
      <div className="xp-container flex flex-col pb-28 pt-[clamp(48px,6vw,96px)] sm:pb-16">
        <FitTitle className="xp-display tracking-[-0.02em]" text={contact?.title?.trim() || "Contáctanos"} />
        <div className={`mt-[clamp(32px,4vw,56px)] grid gap-10 border-t border-white/20 pt-10 ${map ? "lg:grid-cols-2" : ""}`}>
          <div className="flex flex-col gap-7">
            {body ? <p className="m-0 max-w-xl whitespace-pre-line text-[15px] leading-[1.65] text-[#d6d6d6]">{body}</p> :
              phone && <a className="self-start font-mono text-lg hover:opacity-70" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a>}
            <SocialLinks links={links} tone="dark" />
          </div>
          {map && <div className="relative min-h-64 overflow-hidden border border-white/20">
            <iframe className="absolute inset-0 h-full w-full grayscale" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
              src={map} title="Ubicación de la tienda" />
            <a aria-label="Abrir ubicación de la tienda en Google Maps" className="absolute inset-0"
              href={mapDestination(map)} rel="noopener noreferrer" target="_blank" />
          </div>}
        </div>
        {media.length > 0 && <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-4">
          {media.map((image) => <div className="relative aspect-[4/5] overflow-hidden bg-[#242424]" key={image.id}>
            {image.url && !image.removed && <MediaImage alt={image.altText} className="absolute inset-0 h-full w-full object-cover" height={1000}
              sizes="(max-width: 768px) 100vw, 25vw" src={image.url} width={800} />}
          </div>)}
        </div>}
        <div className="mt-12 flex flex-col gap-2.5 border-t border-white/20 pt-6 font-mono text-[11px] tracking-[0.02em] text-[#9a9a9a] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <span>© 2026 XPANDER · Bolivia</span>
            <Link className="hover:text-white" href="/privacidad">Privacidad</Link>
          </span>
          <span>Diseño y desarrollo web · {siteDesigner.url ?
            <a className="text-[#d6d6d6] underline-offset-4 hover:text-white hover:underline" href={siteDesigner.url} rel="noopener" target="_blank">{siteDesigner.name} ↗</a> :
            <span className="text-[#d6d6d6]">{siteDesigner.name}</span>}</span>
        </div>
      </div>
    </footer>
  );
}
