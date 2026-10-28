import type { Metadata } from "next";
import { Suspense } from "react";
import { catalogNav } from "../shop-format";
import SiteFooter, { footerContact } from "../site-footer";
import SiteHeader from "../site-header";
import { fetchBusiness, fetchCatalog, fetchLanding } from "../store-data";

export const metadata: Metadata = {
  title: "Privacidad | XPANDER",
  description: "Qué datos pide XPANDER al registrar un pedido o una sugerencia, para qué los usa y cómo pedir que se eliminen.",
};

// Base text for the owner to review; it describes what the system actually stores.
const sections: { title: string; paragraphs: string[] }[] = [
  { title: "Qué datos pedimos", paragraphs: [
    "Al registrar un pedido pedimos tu nombre, tu número de celular o WhatsApp y, si quieres, indicaciones para la entrega. Si pagas por QR, también guardamos la imagen del comprobante que subes.",
    "La dirección y el costo de un envío a domicilio se coordinan por WhatsApp y no se guardan en el sitio.",
    "Si dejas una sugerencia en el buzón de la página de inicio, guardamos tu nombre, tu celular y tu mensaje.",
  ] },
  { title: "Para qué los usamos", paragraphs: [
    "Solo para preparar y entregar tu pedido: confirmar el pago, separar las prendas en la sucursal y comunicarnos contigo por WhatsApp o llamada. No vendemos ni compartimos tus datos con terceros ni los usamos para publicidad.",
    "Las sugerencias nos ayudan a elegir qué prendas traer; usamos tu celular solo para avisarte si conseguimos lo que pediste.",
  ] },
  { title: "Quién puede verlos", paragraphs: [
    "Únicamente el personal de la tienda desde el panel de administración, protegido con usuario y contraseña. Los comprobantes de pago no son públicos.",
  ] },
  { title: "Cuánto tiempo los guardamos", paragraphs: [
    "Conservamos los pedidos como registro de ventas de la tienda. Puedes pedir en cualquier momento que eliminemos tus datos de contacto y tus comprobantes, salvo lo que debamos conservar por obligaciones legales o contables.",
    "Las sugerencias se guardan mientras nos sirvan para planificar compras y puedes pedir que las borremos cuando quieras.",
  ] },
  { title: "Datos en tu dispositivo", paragraphs: [
    "El carrito y la preferencia de tema claro u oscuro se guardan solo en tu navegador. El sitio no usa cookies de publicidad ni de seguimiento; la única cookie es la de inicio de sesión del panel de administración.",
  ] },
  { title: "Tus derechos", paragraphs: [
    "Puedes pedir ver, corregir o eliminar tus datos escribiéndonos por los medios de contacto que aparecen al pie de esta página.",
  ] },
];

async function Privacy() {
  const [products, business, landing] = await Promise.all([fetchCatalog(), fetchBusiness(), fetchLanding()]);
  return <>
    <SiteHeader nav={catalogNav(products ?? [])} />
    <main className="flex-1 bg-white text-ink">
      <article className="xp-container flex max-w-3xl flex-col gap-10 py-[clamp(48px,7vw,96px)]">
        <header className="flex flex-col gap-4">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-graphite">XPANDER · Privacidad</span>
          <h1 className="xp-display m-0 text-[clamp(36px,5vw,64px)] leading-[0.95] tracking-[-0.02em]">Tus datos</h1>
          <p className="m-0 text-lg leading-relaxed text-body">Pedimos solo lo necesario para atender tu pedido. Aquí te contamos qué guardamos y cómo pedir que lo eliminemos.</p>
        </header>
        {sections.map((section) => <section className="flex flex-col gap-3 border-t border-line pt-6" key={section.title}>
          <h2 className="m-0 text-lg font-semibold">{section.title}</h2>
          {section.paragraphs.map((paragraph) => <p className="m-0 text-[15px] leading-[1.7] text-body" key={paragraph}>{paragraph}</p>)}
        </section>)}
      </article>
    </main>
    <SiteFooter contact={footerContact(landing?.sections)} phone={business?.phone} socialLinks={business?.socialLinks} />
  </>;
}

export default function PrivacyPage() {
  return <Suspense fallback={<p className="py-24 text-center font-mono text-xs uppercase tracking-[0.12em] text-graphite">Cargando…</p>}>
    <Privacy />
  </Suspense>;
}
