import Link from "next/link";
import type { NavItem } from "./shop-format";
import { socialPlatforms } from "./social-platforms";

export function mapDestination(embedUrl: string): string {
  const coordinates = /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/.exec(embedUrl);
  if (!coordinates) return embedUrl;
  const longitude = Number(coordinates[1]);
  const latitude = Number(coordinates[2]);
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return embedUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export default function SiteFooter({ nav, socialLinks = {}, phone = "", mapEmbedUrl = "" }: {
  nav: NavItem[]; socialLinks?: Record<string, string>; phone?: string; mapEmbedUrl?: string;
}) {
  const socials = socialPlatforms.filter(({ key }) => socialLinks[key]);
  const columnTitle = "font-mono text-[11px] uppercase tracking-[0.1em] text-band-muted";
  return (
    <footer className="mt-auto border-t border-band-line bg-band text-band-fg">
      <div className="xp-container flex flex-col gap-16 pb-8 pt-[72px]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-10 text-sm">
          <div className="flex flex-col gap-3">
            <span className={columnTitle}>Tienda</span>
            <Link className="hover:opacity-70" href="/catalogo">Catálogo</Link>
            {nav.map((item) => <Link className="hover:opacity-70" href={item.href} key={item.href}>{item.label}</Link>)}
          </div>
          {socials.length > 0 && <div className="flex flex-col gap-3">
            <span className={columnTitle}>Síguenos</span>
            {socials.map(({ key, label }) => <a className="hover:opacity-70" href={socialLinks[key]} key={key}
              rel="noopener noreferrer" target="_blank">{label}</a>)}
          </div>}
          {phone && <div className="flex flex-col gap-3">
            <span className={columnTitle}>Contacto</span>
            <a className="hover:opacity-70" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a>
            <span className="text-band-muted">Recojo en tienda</span>
          </div>}
        </div>
        {mapEmbedUrl && <div className="relative overflow-hidden border border-band-line">
          <iframe className="h-72 w-full grayscale" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
            src={mapEmbedUrl} title="Ubicación de la tienda" />
          <a aria-label="Abrir ubicación de la tienda en Google Maps" className="absolute inset-0"
            href={mapDestination(mapEmbedUrl)} rel="noopener noreferrer" target="_blank" />
        </div>}
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img alt="XPANDER" className="xp-logo-band block w-full" src="/brand/xpander-wordmark.png" />
        <div className="flex flex-wrap justify-between gap-4 border-t border-band-line pt-6 font-mono text-xs text-band-muted">
          <span>XPANDER · Bolivia</span>
          <span>Precios en bolivianos (Bs.)</span>
        </div>
      </div>
    </footer>
  );
}
