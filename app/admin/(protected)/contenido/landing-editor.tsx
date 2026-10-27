"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LandingSections, { type LandingMedia, type LandingSection } from "../../../landing-sections";
import type { CatalogProduct } from "../../../catalogo/catalog-shop";
import { socialPlatforms } from "../../../social-platforms";
import TrashActions, { type TrashRef } from "../papelera/trash-actions";
import MediaImage from "../../../media-image";
import { EmptyState, Feedback, PageHeader, Pill, ui } from "../../admin-ui";

type DraftSection = LandingSection & {
  id: number;
  isVisible: boolean;
  isDeleted: boolean;
};

type Draft = {
  draftRevision: number;
  publishedVersion: number;
  title: string;
  seoTitle: string;
  seoDescription: string;
  sections: DraftSection[];
};

type Publication = { version: number; publishedAt: string; username: string };
type LibraryMedia = LandingMedia & { isDeleted: boolean; purpose?: "photo" | "qr" };

const sectionTypes = [
  { value: "hero", label: "Portada", hint: "Franja principal con título gigante, texto e imagen 4:5." },
  { value: "text", label: "Texto informativo", hint: "Bloque editorial: imagen 1:1, título, texto y botón al catálogo." },
  { value: "gallery", label: "Galería", hint: "Tarjetas 4:5 con su descripción; con 2 imágenes, paneles grandes." },
  { value: "contact", label: "Contacto", hint: "Redes sociales y mapa en el pie de página." },
  { value: "video", label: "Video", hint: "Franja con reproductor de YouTube o Vimeo." },
  { value: "featured", label: "Productos destacados", hint: "Fichas marcadas como «Destacado» en Productos." },
];

export default function LandingEditor() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<Publication[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [trashed, setTrashed] = useState<TrashRef | null>(null);
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});
  const [library, setLibrary] = useState<LibraryMedia[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<"sections" | "page" | "preview" | "history">("sections");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      try {
        const [draftResponse, historyResponse, mediaResponse, productsResponse] = await Promise.all([
          fetch("/api/admin/landing", { cache: "no-store" }),
          fetch("/api/admin/landing/publications", { cache: "no-store" }),
          fetch("/api/admin/media", { cache: "no-store" }),
          fetch("/api/catalog/products", { cache: "no-store" }),
        ]);
        if (!draftResponse.ok || !historyResponse.ok || !mediaResponse.ok) {
          throw new Error("No se pudo cargar el editor.");
        }
        setDraft((await draftResponse.json()) as Draft);
        setHistory((await historyResponse.json()) as Publication[]);
        setLibrary((await mediaResponse.json()) as LibraryMedia[]);
        if (productsResponse.ok) setCatalogProducts((await productsResponse.json()) as CatalogProduct[]);
      } catch {
        setError("No se pudo cargar el editor. Comprueba que la API esté activa.");
      }
    }
    void load();
  }, []);

  function changePage(field: "title" | "seoTitle" | "seoDescription", value: string) {
    setDraft((current) => current && { ...current, [field]: value });
    setDirty(true);
  }

  function changeSection(index: number, changes: Partial<DraftSection>) {
    setDraft((current) => {
      if (!current) return current;
      const sections = [...current.sections];
      sections[index] = { ...sections[index], ...changes };
      return { ...current, sections };
    });
    setDirty(true);
  }

  function addSection(type: string) {
    const section: DraftSection = {
      id: 0,
      key: `new-${crypto.randomUUID()}`,
      type,
      title: "",
      body: "",
      isVisible: true,
      isDeleted: false,
      media: [],
      contact: { socialLinks: {}, mapUrl: "" },
      video: { url: "", embedUrl: "" },
    };
    setDraft((current) => current && { ...current, sections: [...current.sections, section] });
    setExpanded((current) => ({ ...current, [section.key]: true }));
    setDirty(true);
  }

  function moveSection(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.sections.length) return current;
      const sections = [...current.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...current, sections };
    });
    setDirty(true);
  }

  async function save(current: Draft): Promise<Draft> {
    const response = await fetch("/api/admin/landing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftRevision: current.draftRevision,
        title: current.title,
        seoTitle: current.seoTitle,
        seoDescription: current.seoDescription,
        sections: current.sections.map((section) => ({
          id: section.id,
          type: section.type,
          title: section.title,
          body: section.body,
          isVisible: section.isVisible,
          isDeleted: section.isDeleted,
          mediaIds: section.media.map((item) => item.id),
          contact: section.contact || { socialLinks: {}, mapUrl: "" },
          video: section.video || { url: "", embedUrl: "" },
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(
        response.status === 409
          ? "El borrador cambió en otra sesión. Recarga la página antes de continuar."
          : "No se pudo guardar el borrador.",
      );
    }
    const saved = (await response.json()) as Draft;
    setDraft(saved);
    setDirty(false);
    return saved;
  }

  async function toggleSectionTrash(index: number) {
    if (!draft || busy) return;
    const section = draft.sections[index];
    if (section.id === 0) {
      setDraft({ ...draft, sections: draft.sections.filter((_, position) => position !== index) });
      setDirty(true);
      setNotice("Se descartó una sección que aún no se había guardado.");
      return;
    }
    setBusy(true); setError(""); setNotice(""); setTrashed(null);
    try {
      const updated: Draft = { ...draft, sections: draft.sections.map((item, position) =>
        position === index ? { ...item, isDeleted: !item.isDeleted } : item) };
      await save(updated);
      if (section.isDeleted) setNotice("Sección restaurada en el borrador. Publica para mostrarla a los visitantes.");
      else setTrashed({ kind: "section", id: section.id, label: section.title || `Sección ${section.id}` });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar la sección.");
    } finally {
      setBusy(false);
    }
  }

  async function saveClick() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await save(draft);
      setNotice("Borrador guardado. La landing pública no cambió.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const current = dirty ? await save(draft) : draft;
      const response = await fetch("/api/admin/landing/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftRevision: current.draftRevision }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "No hay cambios nuevos o el borrador cambió. Recarga para comprobarlo."
            : "No se pudo publicar. Debe haber al menos una sección visible.",
        );
      }
      const publication = (await response.json()) as Publication;
      setDraft({ ...current, publishedVersion: publication.version });
      setHistory((previous) => [
        { ...publication, username: "Tú" },
        ...previous,
      ].slice(0, 20));
      setNotice(`Versión ${publication.version} publicada. Ya puedes abrir la landing pública.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(index: number, file: File) {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("altText", altTexts[draft.sections[index].key] || draft.sections[index].title);
      const response = await fetch("/api/admin/media", { method: "POST", body: data });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo subir la imagen. Usa PNG, JPEG o WebP de hasta 8 MiB.");
      const media = (await response.json()) as LandingMedia;
      changeSection(index, { media: [...draft.sections[index].media, media] });
      const mediaResponse = await fetch("/api/admin/media", { cache: "no-store" });
      if (mediaResponse.ok) setLibrary((await mediaResponse.json()) as LibraryMedia[]);
      setNotice("Imagen subida. Guarda el borrador para asociarla a la sección.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return <p className="text-sm text-graphite">{error || "Cargando editor…"}</p>;
  }

  const tabs = [
    { value: "sections" as const, label: "Secciones", count: draft.sections.filter((section) => !section.isDeleted).length },
    { value: "page" as const, label: "Página y SEO" },
    { value: "preview" as const, label: "Vista previa" },
    { value: "history" as const, label: "Historial", count: history.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader actions={<Link className={ui.secondary} href="/" target="_blank">Abrir landing publicada ↗</Link>}
        description="Edita libremente el borrador: los visitantes solo ven los cambios al publicar. Enviar una sección a la papelera guarda también los demás cambios pendientes."
        eyebrow="Contenido web · Landing" title="Contenido web" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[["Versión pública", draft.publishedVersion ? `v${draft.publishedVersion}` : "Ninguna"], ["Revisión del borrador", `#${draft.draftRevision}`],
          ["Secciones visibles", String(draft.sections.filter((section) => section.isVisible && !section.isDeleted).length)],
          ["Estado", dirty ? "Cambios sin guardar" : "Guardado"]].map(([label, value]) => <div className="flex flex-col gap-2 bg-white p-4 sm:p-5" key={label}>
            <span className="text-[13px] text-graphite">{label}</span><span className={`font-mono text-xl ${label === "Estado" && dirty ? "text-red-700" : ""}`}>{value}</span>
          </div>)}
      </div>
      <Feedback error={error} notice={notice} />
      {trashed && <TrashActions item={trashed} notice onChanged={() => window.location.reload()} />}

      <div aria-label="Apartados del editor" className="flex gap-0 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map((item) => <button aria-selected={tab === item.value} className={`-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm ${
          tab === item.value ? "border-ink font-semibold" : "border-transparent text-graphite hover:text-ink"}`}
          key={item.value} onClick={() => setTab(item.value)} role="tab" type="button">{item.label}
          {item.count !== undefined && <span className="font-mono text-[11px] opacity-70">{item.count}</span>}</button>)}
      </div>

      <fieldset className="m-0 flex flex-col gap-5 border-0 p-0" disabled={busy}>
      {tab === "page" && <section className={`${ui.card} ${ui.cardPad}`}>
        <h2 className={ui.cardTitle}>Datos de la página</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className={ui.label}>Título de la página *
            <input className={ui.input} maxLength={180} onChange={(event) => changePage("title", event.target.value)} required value={draft.title} />
            <span className={ui.hint}>Se usa en la portada cuando la sección no tiene título propio.</span>
          </label>
          <label className={ui.label}>Título para buscadores
            <input className={ui.input} maxLength={180} onChange={(event) => changePage("seoTitle", event.target.value)} value={draft.seoTitle} />
            <span className={ui.hint}>{draft.seoTitle.length} / 180</span>
          </label>
          <label className={`${ui.label} md:col-span-2`}>Descripción para buscadores
            <textarea className={ui.textarea} maxLength={500} onChange={(event) => changePage("seoDescription", event.target.value)} rows={3} value={draft.seoDescription} />
            <span className={ui.hint}>{draft.seoDescription.length} / 500</span>
          </label>
        </div>
      </section>}

      {tab === "sections" && <>
        {draft.sections.length === 0 && <EmptyState>Todavía no hay secciones. Agrega una portada para comenzar.</EmptyState>}
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {draft.sections.map((section, index) => {
          const type = sectionTypes.find((item) => item.value === section.type);
          const open = expanded[section.key] ?? false;
          return <li className={`bg-white ${section.isDeleted ? "opacity-60" : ""}`} key={section.key}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <span className="font-mono text-xs text-graphite">{String(index + 1).padStart(2, "0")}</span>
              <button aria-expanded={open} className="flex min-w-0 flex-1 flex-col text-left" onClick={() => setExpanded((current) => ({ ...current, [section.key]: !open }))} type="button">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={ui.eyebrow}>{type?.label || section.type}</span>
                  {!section.isVisible && !section.isDeleted && <Pill tone="dashed">Oculta</Pill>}
                  {section.isDeleted && <Pill tone="danger">Eliminada del borrador</Pill>}
                  {section.id === 0 && <Pill tone="soft">Nueva, sin guardar</Pill>}
                </span>
                <span className="truncate text-[15px] font-semibold">{section.title || "Sin título"}</span>
              </button>
              <div className="flex flex-wrap items-center gap-1.5">
                <button aria-label="Subir sección" className={ui.quiet} disabled={index === 0} onClick={() => moveSection(index, -1)} type="button">↑</button>
                <button aria-label="Bajar sección" className={ui.quiet} disabled={index === draft.sections.length - 1} onClick={() => moveSection(index, 1)} type="button">↓</button>
                <button className={ui.quiet} onClick={() => changeSection(index, { isVisible: !section.isVisible })} type="button">{section.isVisible ? "Ocultar" : "Mostrar"}</button>
                <button className={ui.quiet} onClick={() => void toggleSectionTrash(index)} type="button">{section.isDeleted ? "Restaurar" : "Eliminar"}</button>
                <button aria-label={open ? "Contraer" : "Editar"} className={ui.quiet} onClick={() => setExpanded((current) => ({ ...current, [section.key]: !open }))} type="button">{open ? "−" : "Editar"}</button>
              </div>
            </div>
            {open && <div className="flex flex-col gap-5 border-t border-line p-4 sm:p-5">
              {type && <p className={`${ui.hint} m-0`}>{type.hint}</p>}
              <div className="grid gap-4">
                <label className={ui.label}>Título
                  <input className={ui.input} maxLength={180} onChange={(event) => changeSection(index, { title: event.target.value })} value={section.title} />
                </label>
                <label className={ui.label}>Texto
                  <textarea className={ui.textarea} maxLength={10000} onChange={(event) => changeSection(index, { body: event.target.value })} rows={4} value={section.body} />
                </label>
              </div>
              {section.type === "contact" && <div className="flex flex-col gap-4 bg-soft p-4">
                <h4 className="m-0 text-sm font-semibold">Redes sociales y ubicación</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  {socialPlatforms.map(({ key, label }) => (
                    <label className={ui.label} key={key}>{label}
                      <input className={ui.input} placeholder="https://..." type="url"
                        onChange={(event) => changeSection(index, { contact: {
                          ...section.contact, socialLinks: { ...section.contact?.socialLinks, [key]: event.target.value },
                        } })} value={section.contact?.socialLinks?.[key] || ""} />
                    </label>
                  ))}
                  <label className={`${ui.label} sm:col-span-2`}>Enlace de ubicación de Google Maps
                    <input className={ui.input} placeholder="https://www.google.com/maps/embed?pb=..." type="url"
                      onChange={(event) => changeSection(index, { contact: { ...section.contact, mapUrl: event.target.value } })}
                      value={section.contact?.mapUrl || ""} />
                    <span className={ui.hint}>En Google Maps usa Compartir → Incorporar un mapa → Copiar HTML; pega aquí solo la URL que aparece en src. El mapa aparecerá en el pie de página.</span>
                  </label>
                </div>
              </div>}
              {section.type === "video" && <label className={ui.label}>Enlace de YouTube o Vimeo *
                <input className={ui.input} placeholder="https://www.youtube.com/watch?v=..." type="url"
                  onChange={(event) => changeSection(index, { video: { url: event.target.value, embedUrl: "" } })}
                  value={section.video?.url || ""} />
                <span className={ui.hint}>Puedes guardar un borrador sin enlace; para publicar esta sección visible, el video debe estar completo.</span>
              </label>}
              {section.type === "featured" && <p className="m-0 bg-soft p-4 text-sm text-body">
                Los productos de esta sección se eligen marcando «Destacado» en cada ficha. Sus precios e imágenes se leen del catálogo activo.
                <Link className="ml-1 underline" href="/admin/catalogo/productos">Abrir productos</Link>
              </p>}
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between"><p className="m-0 text-sm font-semibold">Imágenes</p>
                  <span className="font-mono text-xs text-graphite">{section.media.length} / 12</span></div>
                {section.media.length > 0 && <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {section.media.map((image) => (
                    <div className="flex flex-col gap-1.5" key={image.id}>
                      <div className="relative aspect-square overflow-hidden bg-mist">
                        {image.url && !image.removed && <MediaImage alt={image.altText} className="absolute inset-0 h-full w-full object-cover" height={160}
                          sizes="160px" src={image.url} width={160} />}
                      </div>
                      <span className="truncate text-xs" title={image.altText}>{image.altText || `Imagen ${image.id}`}</span>
                      <button className={`${ui.dangerLink} self-start text-xs`} onClick={() => changeSection(index,
                        { media: section.media.filter((item) => item.id !== image.id) })} type="button">Quitar</button>
                    </div>
                  ))}
                </div>}
                <div className="grid gap-3 border-t border-line pt-4 md:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <label className={ui.label}>Texto alternativo de la nueva imagen
                      <input className={ui.input} maxLength={200}
                        onChange={(event) => setAltTexts((current) => ({ ...current, [section.key]: event.target.value }))}
                        placeholder="Describe la imagen" value={altTexts[section.key] || ""} />
                    </label>
                    <label className={ui.label}>Subir PNG, JPEG o WebP
                      <input accept="image/jpeg,image/png,image/webp" className={ui.file} disabled={busy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadImage(index, file);
                          event.target.value = "";
                        }} type="file" />
                    </label>
                  </div>
                  <div className="flex flex-col gap-3">
                    <label className={ui.label}>O elegir del banco de imágenes
                      <select className={ui.input}
                        onChange={(event) => setSelectedMedia((current) => ({ ...current, [section.key]: Number(event.target.value) }))}
                        value={selectedMedia[section.key] || 0}>
                        <option value={0}>Selecciona una imagen</option>
                        {library.filter((item) => !item.isDeleted && item.purpose !== "qr" && !section.media.some((used) => used.id === item.id)).map((item) =>
                          <option key={item.id} value={item.id}>{item.altText || `Imagen ${item.id}`}</option>)}
                      </select>
                    </label>
                    <button className={`${ui.secondary} self-start`}
                      disabled={!selectedMedia[section.key] || section.media.length >= 12}
                      onClick={() => {
                        const item = library.find((media) => media.id === selectedMedia[section.key] && !media.isDeleted);
                        if (item) changeSection(index, { media: [...section.media, item] });
                        setSelectedMedia((current) => ({ ...current, [section.key]: 0 }));
                      }} type="button">Agregar imagen</button>
                  </div>
                </div>
              </div>
            </div>}
          </li>;
        })}
        </ol>
        <section className={`${ui.card} ${ui.cardPad}`}>
          <h2 className={ui.cardTitle}>Agregar sección</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sectionTypes.map((item) => (
              <button className="flex flex-col gap-1 border border-line p-4 text-left transition-colors hover:border-ink" key={item.value}
                onClick={() => addSection(item.value)} type="button">
                <span className="text-sm font-semibold">+ {item.label}</span>
                <span className="text-xs text-graphite">{item.hint}</span>
              </button>
            ))}
          </div>
        </section>
      </>}
      </fieldset>

      {tab === "preview" && <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] text-graphite">Vista del borrador actual (incluye cambios sin guardar). Solo se muestran las secciones visibles y no eliminadas.</p>
        <div className="overflow-hidden border border-line bg-white">
          <LandingSections landing={draft} products={catalogProducts} />
        </div>
      </div>}

      {tab === "history" && <section className={ui.card}>
        <div className="border-b border-line px-5 py-4 sm:px-6"><h2 className={ui.cardTitle}>Historial de publicaciones</h2></div>
        {history.length === 0 ? <p className="m-0 p-6 text-sm text-graphite">Aún no hay versiones publicadas.</p> : (
          <ul className="m-0 list-none p-0">
            {history.map((item, index) => (
              <li className="flex flex-wrap items-center gap-3 border-t border-mist px-5 py-3 text-sm first:border-0 sm:px-6" key={item.version}>
                <span className="w-12 font-mono">v{item.version}</span>
                <span className="flex-1 text-graphite">{new Date(item.publishedAt).toLocaleString("es-BO")}{item.username && ` · ${item.username}`}</span>
                {index === 0 && <Pill tone="solid">Pública</Pill>}
              </li>
            ))}
          </ul>
        )}
      </section>}

      <div className="sticky bottom-20 z-30 flex flex-wrap items-center gap-3 border border-line bg-white p-4 shadow-lg lg:bottom-4">
        <button className={ui.secondary} disabled={busy || !dirty} onClick={() => void saveClick()} type="button">Guardar borrador</button>
        <button className={ui.primary} disabled={busy} onClick={() => void publish()} type="button">Publicar</button>
        <button className={`${ui.link} hidden sm:inline`} onClick={() => setTab("preview")} type="button">Ver vista previa</button>
        <span className="ml-auto text-[13px] text-graphite">
          {busy ? "Procesando…" : dirty ? "Cambios sin guardar" : `Borrador guardado · versión pública ${draft.publishedVersion || "ninguna"}`}
        </span>
      </div>
    </div>
  );
}
