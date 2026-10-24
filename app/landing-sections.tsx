import Image from "next/image";
import Link from "next/link";

export type LandingMedia = {
  id: number;
  kind: string;
  url: string;
  altText: string;
};

export type LandingSection = {
  key: string;
  type: string;
  title: string;
  body: string;
  media: LandingMedia[];
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
  return (
    <Image
      alt={image.altText}
      className={`w-full rounded-xl object-cover ${wide ? "max-h-[34rem]" : "aspect-[4/3]"}`}
      height={wide ? 900 : 600}
      src={image.url}
      unoptimized
      width={wide ? 1600 : 800}
    />
  );
}

export default function LandingSections({ landing }: { landing: PublishedLanding }) {
  const sections = landing.sections.filter(
    (section) => section.isVisible !== false && section.isDeleted !== true,
  );
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
        XPANDER · Bolivia
      </footer>
    </>
  );
}
