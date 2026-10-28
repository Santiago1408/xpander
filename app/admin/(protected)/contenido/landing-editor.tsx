"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LandingSections, { LandingHero, defaultBenefits, defaultHero, type BenefitItem, type CategoriesConfig, type CategoryTile, type HeroConfig, type LandingMedia, type LandingSection, type PublishedLanding } from "../../../landing-sections";
import { BenefitIcon, benefitIconOptions } from "../../../benefit-icons";
import { catalogBrands, catalogTerms, titleCase } from "../../../shop-format";
import type { CatalogProduct } from "../../../catalogo/catalog-shop";
import { socialPlatforms } from "../../../social-platforms";
import TrashActions, { type TrashRef } from "../papelera/trash-actions";
import MediaImage from "../../../media-image";
import { ConfirmDialog, EmptyState, FileField, Feedback, IconButton, PageHeader, Pill, ui } from "../../admin-ui";

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
type LibraryMedia = LandingMedia & { isDeleted: boolean; purpose?: "photo" | "qr" | "logo" };

const sectionTypes = [
  { value: "hero", label: "Portada", hint: "Bienvenida con título gigante, en cuatro diseños; con imagen o video." },
  { value: "text", label: "Texto informativo", hint: "Bloque editorial: imagen 1:1, título, texto y botón al catálogo." },
  { value: "gallery", label: "Galería", hint: "Tarjetas 4:5 de imágenes o videos con su descripción; con 2, paneles grandes." },
  { value: "contact", label: "Contacto", hint: "Pie de página de toda la tienda: título a todo el ancho, texto, redes sociales y mapa." },
  { value: "suggestions", label: "Buzón de sugerencias", hint: "Formulario sobre el pie de página: los clientes dejan su nombre, su celular y las prendas que buscan. Llegan a Sugerencias." },
  { value: "video", label: "Video", hint: "Franja con reproductor de YouTube o Vimeo." },
  { value: "featured", label: "Productos destacados", hint: "Fichas marcadas como «Destacado» en Productos." },
  { value: "benefits", label: "Beneficios", hint: "Franja de hasta 6 beneficios con ícono, título y texto (recojo, pago, envío…). Reemplaza la franja automática antes del pie." },
  { value: "categories", label: "Bloques de imágenes", hint: "Imágenes grandes con su texto y enlace al catálogo; como tarjetas o paneles, en 1 a 3 columnas. Reemplaza el bloque automático «Compra por estilo»." },
];

const blankTile = (): CategoryTile => ({ mediaId: 0, title: "", linkKind: "", linkValue: "" });

// Sections shown in a fixed place at the end of the page, outside the ordered list.
const pinnedTypes = ["suggestions", "contact"];
// Uploaded videos are accepted by the API in these sections only.
const videoSections = ["hero", "gallery", "categories"];
const maxVideos = 5;
const maxVideoSeconds = 30;
const maxVideoBytes = 100 * 1024 * 1024;

const heroVariants: { value: HeroConfig["variant"]; label: string; hint: string }[] = [
  { value: "classic", label: "Clásica", hint: "Texto a un lado e imagen 4:5 al otro." },
  { value: "cover", label: "Fondo completo", hint: "La imagen o el video cubre toda la franja, con el texto encima." },
  { value: "split", label: "Pantalla dividida", hint: "Mitad texto, mitad imagen hasta el borde de la pantalla." },
  { value: "centered", label: "Centrada", hint: "Título centrado y una franja panorámica debajo." },
];

// Small diagram of each cover layout for the variant picker.
function HeroSketch({ variant }: { variant: HeroConfig["variant"] }) {
  const lines = (center = false, light = false) => <span className={`flex w-full flex-col gap-1 ${center ? "items-center" : ""}`}>
    <span className={`h-1.5 w-3/4 ${light ? "bg-white" : "bg-ink"}`} /><span className={`h-1.5 w-1/2 ${light ? "bg-white" : "bg-ink"}`} />
    <span className={`mt-0.5 h-1 w-1/3 ${light ? "bg-white/60" : "bg-[#bdbdbd]"}`} />
  </span>;
  if (variant === "cover") return <span className="flex h-full flex-col justify-end bg-[linear-gradient(135deg,#5e5e5e,#242424)] p-2">{lines(false, true)}</span>;
  if (variant === "split") return <span className="grid h-full grid-cols-2"><span className="flex items-end p-2">{lines()}</span><span className="bg-[#bdbdbd]" /></span>;
  if (variant === "centered") return <span className="flex h-full flex-col items-center gap-1.5 p-2">{lines(true)}<span className="w-full flex-1 bg-[#bdbdbd]" /></span>;
  return <span className="grid h-full grid-cols-2 gap-2 p-2"><span className="flex items-end">{lines()}</span><span className="bg-[#bdbdbd]" /></span>;
}

function sentence(text: string, fallback: string) {
  const value = text.trim() || fallback;
  return value.charAt(0).toLocaleUpperCase("es-BO") + value.slice(1) + (/[.!?]$/.test(value) ? "" : ".");
}

// Reads the length of a video in the browser before uploading it. Some formats
// (HEVC on older browsers) cannot be read here; the server checks them anyway.
function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number) => { URL.revokeObjectURL(url); resolve(value); };
    video.preload = "metadata";
    video.onloadedmetadata = () => done(video.duration);
    video.onerror = () => done(Number.NaN);
    video.src = url;
  });
}

// Uploads with XMLHttpRequest to show progress: phone videos can weigh tens of MB.
function sendVideo(file: File, altText: string, onProgress: (percent: number) => void): Promise<LandingMedia> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/admin/media/videos");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.upload.onload = () => onProgress(100);
    request.onload = () => request.status === 201 ? resolve(JSON.parse(request.responseText) as LandingMedia) :
      reject(new Error(sentence(request.status === 413 ? "el video supera los 100 MB" : request.responseText, "No se pudo subir el video")));
    request.onerror = () => reject(new Error("Se perdió la conexión al subir el video. Inténtalo de nuevo."));
    const data = new FormData();
    data.append("altText", altText);
    data.append("file", file);
    request.send(data);
  });
}

// Thumbnails of videos use their poster still.
function thumbnailSrc(item: Pick<LandingMedia, "kind" | "url">) {
  return item.kind === "video" ? `${item.url}?size=thumb` : item.url;
}

function VideoProgress({ percent }: { percent: number }) {
  return <div className="flex flex-col gap-1.5" role="status">
    <span className="text-xs text-body">{percent < 100 ? `Subiendo video… ${percent} %` : "Procesando video… puede tardar hasta un minuto. No cierres esta página."}</span>
    <div className="h-1.5 bg-mist"><div className={`h-1.5 bg-ink ${percent >= 100 ? "animate-pulse" : ""}`} style={{ width: `${percent}%` }} /></div>
  </div>;
}

function mediaLabel(item: Pick<LandingMedia, "id" | "kind" | "altText">) {
  const kind = item.kind === "video" ? "Video" : "Imagen";
  return item.kind === "video" ? `Video · ${item.altText || item.id}` : item.altText || `${kind} ${item.id}`;
}

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
  const [versionPreview, setVersionPreview] = useState<{ version: number; landing: PublishedLanding } | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ key: string; percent: number } | null>(null);

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
    if (type === "benefits") section.benefits = { items: defaultBenefits.map((item) => ({ ...item })) };
    if (type === "hero") section.hero = { ...defaultHero };
    if (type === "suggestions") {
      section.title = "¿Qué prenda te gustaría encontrar?";
      section.body = "Cuéntanos qué buscas: marca, modelo, talla o color. Lo tendremos en cuenta en nuestra próxima compra y te escribiremos si lo conseguimos.";
    }
    if (type === "categories") {
      // Start from the catalog styles; each block still needs its own image.
      const styles = catalogTerms(catalogProducts).styles;
      section.title = "Compra por estilo";
      section.categories = { layout: "cards", columns: Math.min(3, Math.max(2, styles.length)) || 2,
        tiles: styles.length ? styles.slice(0, 6).map((style) => ({ mediaId: 0, title: titleCase(style), linkKind: "style" as const, linkValue: style })) : [blankTile(), blankTile()] };
    }
    setDraft((current) => current && { ...current, sections: [...current.sections, section] });
    setExpanded((current) => ({ ...current, [section.key]: true }));
    setDirty(true);
  }

  function moveSection(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      // Contact and suggestion sections are pinned above and in the footer, so moves step over them.
      let target = index + direction;
      while (pinnedTypes.includes(current.sections[target]?.type ?? "")) target += direction;
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
          mediaIds: section.type === "categories" ? (section.categories?.tiles || []).map((tile) => tile.mediaId).filter(Boolean) : section.media.map((item) => item.id),
          contact: section.contact || { socialLinks: {}, mapUrl: "" },
          video: section.video || { url: "", embedUrl: "" },
          ...(section.type === "categories" ? { categories: section.categories || { layout: "cards", columns: 2, tiles: [] } } : {}),
          ...(section.type === "benefits" ? { benefits: section.benefits || { items: [] } } : {}),
          ...(section.type === "hero" ? { hero: { ...defaultHero, ...section.hero } } : {}),
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

  async function loadVersion(version: number): Promise<PublishedLanding> {
    const response = await fetch(`/api/admin/landing/publications/${version}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo leer la versión ${version}.`);
    return (await response.json()) as PublishedLanding;
  }

  async function previewVersion(version: number) {
    if (busy) return;
    setBusy(true); setError("");
    try { setVersionPreview({ version, landing: await loadVersion(version) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo leer la versión."); }
    finally { setBusy(false); }
  }

  // Replaces the draft with a published version. Its sections keep their identity
  // when they still exist; the others go to the recycle bin, so nothing is lost.
  async function restoreVersion(version: number) {
    if (!draft || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const snapshot = await loadVersion(version);
      const available = new Map(library.filter((item) => !item.isDeleted).map((item) => [item.id, item]));
      const current = new Map(draft.sections.map((section) => [section.key, section]));
      let omitted = 0;
      const restored: DraftSection[] = snapshot.sections.map((section) => {
        const existing = current.get(section.key);
        const media = section.media.flatMap((item) => available.get(item.id) ? [available.get(item.id)!] : (omitted++, []));
        const categories = section.categories && { ...section.categories, tiles: section.categories.tiles.map((tile) =>
          tile.mediaId && !available.has(tile.mediaId) ? (omitted++, { ...tile, mediaId: 0 }) : tile) };
        return { ...section, id: existing?.id ?? 0, key: existing?.key ?? `new-${crypto.randomUUID()}`, isVisible: true, isDeleted: false,
          media, categories, contact: section.contact || { socialLinks: {}, mapUrl: "" }, video: section.video || { url: "", embedUrl: "" } };
      });
      const restoredKeys = new Set(snapshot.sections.map((section) => section.key));
      const trashed = draft.sections.filter((section) => section.id !== 0 && !restoredKeys.has(section.key))
        .map((section) => ({ ...section, isDeleted: true }));
      await save({ ...draft, title: snapshot.title, seoTitle: snapshot.seoTitle || "", seoDescription: snapshot.seoDescription || "", sections: [...restored, ...trashed] });
      setRestoring(null); setVersionPreview(null); setTab("sections");
      setNotice(`El borrador ahora es la versión ${version}${omitted ? `; se omitieron ${omitted} imagen(es) que ya no existen` : ""}. Revísalo y publica para mostrarlo.`);
    } catch (failure) {
      setRestoring(null);
      setError(failure instanceof Error ? failure.message : "No se pudo restaurar la versión.");
    } finally { setBusy(false); }
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

  async function uploadImage(index: number, file: File, replace = false) {
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
      changeSection(index, { media: replace ? [media] : [...draft.sections[index].media, media] });
      const mediaResponse = await fetch("/api/admin/media", { cache: "no-store" });
      if (mediaResponse.ok) setLibrary((await mediaResponse.json()) as LibraryMedia[]);
      setNotice("Imagen subida. Guarda el borrador para asociarla a la sección.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  }

  // Block images live in page_section_media too; keep section.media in tile order.
  function changeCategories(index: number, changes: Partial<CategoriesConfig>, extra: LandingMedia[] = []) {
    const section = draft!.sections[index];
    const config = { ...(section.categories || { layout: "cards" as const, columns: 2, tiles: [] }), ...changes };
    const known = new Map([...section.media, ...library, ...extra].map((item) => [item.id, item]));
    changeSection(index, { categories: config, media: config.tiles.flatMap((tile) => known.get(tile.mediaId) ? [known.get(tile.mediaId)!] : []) });
  }

  function changeTile(index: number, tileIndex: number, changes: Partial<CategoryTile>, extra: LandingMedia[] = []) {
    const tiles = [...(draft!.sections[index].categories?.tiles || [])];
    tiles[tileIndex] = { ...tiles[tileIndex], ...changes };
    changeCategories(index, { tiles }, extra);
  }

  async function uploadTileImage(index: number, tileIndex: number, file: File) {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("altText", draft.sections[index].categories?.tiles[tileIndex]?.title || draft.sections[index].title);
      const response = await fetch("/api/admin/media", { method: "POST", body: data });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo subir la imagen. Usa PNG, JPEG o WebP de hasta 8 MiB.");
      const media = (await response.json()) as LandingMedia;
      changeTile(index, tileIndex, { mediaId: media.id }, [media]);
      const mediaResponse = await fetch("/api/admin/media", { cache: "no-store" });
      if (mediaResponse.ok) setLibrary((await mediaResponse.json()) as LibraryMedia[]);
      setNotice("Imagen subida. Guarda el borrador para asociarla al bloque.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  }

  // Checks the limits in the browser, uploads with progress and hands the
  // stored video to place(), which puts it in the section or the block.
  async function uploadVideo(key: string, file: File, altText: string, place: (media: LandingMedia) => void) {
    if (!draft || busy) return;
    setError(""); setNotice("");
    if (library.filter((item) => item.kind === "video").length >= maxVideos) {
      setError(`Ya hay ${maxVideos} videos guardados, el máximo. Elimina uno definitivamente desde la Papelera para subir otro.`);
      return;
    }
    if (file.size > maxVideoBytes) {
      setError("El video supera los 100 MB. Recórtalo o expórtalo con menor resolución.");
      return;
    }
    const seconds = await videoDuration(file);
    if (seconds > maxVideoSeconds + 0.5) {
      setError(`El video dura ${Math.ceil(seconds)} segundos; el máximo es ${maxVideoSeconds}. Recórtalo en tu celular antes de subirlo.`);
      return;
    }
    setBusy(true); setVideoProgress({ key, percent: 0 });
    try {
      const media = await sendVideo(file, altText, (percent) => setVideoProgress({ key, percent }));
      place(media);
      const mediaResponse = await fetch("/api/admin/media", { cache: "no-store" });
      if (mediaResponse.ok) setLibrary((await mediaResponse.json()) as LibraryMedia[]);
      setNotice("Video listo. Guarda el borrador para asociarlo a la sección.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo subir el video.");
    } finally {
      setBusy(false); setVideoProgress(null);
    }
  }

  if (!draft) {
    return <p className="text-sm text-graphite">{error || "Cargando editor…"}</p>;
  }

  const terms = catalogTerms(catalogProducts);
  const linkGroups = [
    { kind: "style" as const, label: "Estilos", values: terms.styles },
    { kind: "audience" as const, label: "Público", values: terms.audiences },
    { kind: "brand" as const, label: "Marcas", values: catalogBrands(catalogProducts) },
  ];

  function changeBenefits(index: number, items: BenefitItem[]) {
    changeSection(index, { benefits: { items } });
  }

  function benefitsEditor(section: DraftSection, index: number) {
    const items = section.benefits?.items || [];
    const update = (itemIndex: number, changes: Partial<BenefitItem>) =>
      changeBenefits(index, items.map((item, other) => other === itemIndex ? { ...item, ...changes } : item));
    return <div className="flex flex-col gap-4 bg-soft p-4">
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((item, itemIndex) => <li className="flex flex-col gap-3 border border-line bg-white p-3" key={itemIndex}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-mono text-xs text-graphite"><BenefitIcon className="size-5 text-ink" icon={item.icon} />Beneficio {String(itemIndex + 1).padStart(2, "0")}</span>
            <span className="flex gap-1.5">
              <IconButton disabled={itemIndex === 0} icon="up" label="Mover antes" onClick={() => {
                const next = [...items]; [next[itemIndex - 1], next[itemIndex]] = [next[itemIndex], next[itemIndex - 1]]; changeBenefits(index, next);
              }} />
              <IconButton disabled={itemIndex === items.length - 1} icon="down" label="Mover después" onClick={() => {
                const next = [...items]; [next[itemIndex + 1], next[itemIndex]] = [next[itemIndex], next[itemIndex + 1]]; changeBenefits(index, next);
              }} />
              <IconButton icon="delete" label="Quitar beneficio" onClick={() => changeBenefits(index, items.filter((_, other) => other !== itemIndex))} tone="danger" />
            </span>
          </div>
          <div aria-label="Ícono" className="flex flex-wrap gap-1.5" role="radiogroup">
            {benefitIconOptions.map((option) => <button aria-checked={item.icon === option.key} aria-label={option.label} key={option.key} role="radio" title={option.label}
              className={`inline-flex size-10 items-center justify-center border ${item.icon === option.key ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
              onClick={() => update(itemIndex, { icon: option.key })} type="button"><BenefitIcon className="size-5" icon={option.key} /></button>)}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr]">
            <label className={ui.label}>Título
              <input className={ui.input} maxLength={80} onChange={(event) => update(itemIndex, { title: event.target.value })} value={item.title} />
            </label>
            <label className={ui.label}>Texto
              <input className={ui.input} maxLength={240} onChange={(event) => update(itemIndex, { text: event.target.value })} value={item.text} />
            </label>
          </div>
        </li>)}
      </ol>
      <button className={`${ui.secondary} self-start`} disabled={items.length >= 6}
        onClick={() => changeBenefits(index, [...items, { icon: "star", title: "", text: "" }])} type="button">+ Agregar beneficio</button>
    </div>;
  }

  function changeHero(index: number, changes: Partial<HeroConfig>) {
    changeSection(index, { hero: { ...defaultHero, ...draft!.sections[index].hero, ...changes } });
  }

  function heroEditor(section: DraftSection, index: number) {
    const config = { ...defaultHero, ...section.hero };
    const media = section.media[0];
    const segment = (selected: boolean) => `h-10 flex-1 px-2 text-[13px] font-medium ${selected ? "bg-ink text-white" : "bg-white hover:bg-soft"}`;
    const choices = library.filter((item) => !item.isDeleted && item.purpose !== "qr" && item.purpose !== "logo");
    const progress = videoProgress?.key === section.key ? videoProgress.percent : null;
    const setMedia = (item: LandingMedia | undefined) => changeSection(index, { media: item ? [item] : [] });
    return <div className="flex flex-col gap-5 bg-soft p-4">
      <div className={ui.label}>Diseño
        <div aria-label="Diseño de la portada" className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup">
          {heroVariants.map((variant) => <button aria-checked={config.variant === variant.value} key={variant.value} role="radio" type="button"
            className={`flex flex-col gap-2 border bg-white p-2 text-left transition-colors ${config.variant === variant.value ? "border-ink shadow-[0_0_0_1px_#141414]" : "border-line hover:border-ink"}`}
            onClick={() => changeHero(index, { variant: variant.value })}>
            <span aria-hidden="true" className="block aspect-[16/10] overflow-hidden border border-line bg-white"><HeroSketch variant={variant.value} /></span>
            <span className="text-[13px] font-semibold">{variant.label}</span>
            <span className="text-xs font-normal leading-snug text-graphite">{variant.hint}</span>
          </button>)}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <div className="relative aspect-[4/5] w-full max-w-[200px] overflow-hidden bg-mist md:w-[160px]">
          {media && media.url && !media.removed ? <MediaImage alt={media.altText} className="absolute inset-0 h-full w-full object-cover" height={200} sizes="160px" src={thumbnailSrc(media)} width={160} /> :
            <span className="absolute inset-0 flex items-center justify-center p-2 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-graphite">{media?.removed ? "Archivo eliminado" : "Sin imagen ni video"}</span>}
          {media?.kind === "video" && <span className="absolute left-2 top-2 bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-white">Video</span>}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="m-0 text-sm font-semibold">{config.variant === "cover" ? "Fondo de la portada" : "Imagen o video de la portada"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FileField accept="image/jpeg,image/png,image/webp" disabled={busy} hint="PNG, JPEG o WebP de hasta 8 MiB" label={media ? "Cambiar por una imagen" : "Subir imagen"}
              onFile={(file) => { if (file) void uploadImage(index, file, true); }} />
            <FileField accept="video/mp4,video/quicktime,video/webm" disabled={busy} hint={`MP4, MOV o WebM · hasta ${maxVideoSeconds} s y 100 MB`} label={media ? "Cambiar por un video" : "Subir video"}
              onFile={(file) => { if (file) void uploadVideo(section.key, file, section.title, (item) => setMedia(item)); }} />
          </div>
          {progress !== null && <VideoProgress percent={progress} />}
          <div className="flex flex-wrap items-center gap-3">
            <select aria-label="Elegir del banco" className={`${ui.input} sm:max-w-xs`} onChange={(event) => setMedia(choices.find((item) => item.id === Number(event.target.value)))}
              value={media && choices.some((item) => item.id === media.id) ? media.id : 0}>
              <option value={0}>O elegir del banco…</option>
              {choices.map((item) => <option key={item.id} value={item.id}>{mediaLabel(item)}</option>)}
            </select>
            {media && <button className={ui.dangerLink} onClick={() => setMedia(undefined)} type="button">Quitar</button>}
          </div>
          <span className={ui.hint}>Los videos se reproducen solos, en bucle y sin sonido. Videos guardados: {library.filter((item) => item.kind === "video").length} de {maxVideos}.</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={ui.label}>Tamaño del título
          <div aria-label="Tamaño del título" className="flex border border-ink" role="radiogroup">
            {(["s", "m", "l", "xl"] as const).map((size) => <button aria-checked={config.titleSize === size} className={segment(config.titleSize === size)} key={size}
              onClick={() => changeHero(index, { titleSize: size })} role="radio" type="button">{size.toUpperCase()}</button>)}
          </div>
        </div>
        {(config.variant === "cover" || config.variant === "split") && <div className={ui.label}>Altura
          <div aria-label="Altura de la portada" className="flex border border-ink" role="radiogroup">
            {([["full", "Pantalla completa"], ["medium", "Media"]] as const).map(([value, label]) => <button aria-checked={config.height === value} className={segment(config.height === value)} key={value}
              onClick={() => changeHero(index, { height: value })} role="radio" type="button">{label}</button>)}
          </div>
        </div>}
        {config.variant === "cover" && <>
          <label className={ui.label}><span>Opacamiento del fondo · <span className="font-mono">{config.overlay} %</span></span>
            <input className="h-11 w-full accent-ink" max={85} min={0} onChange={(event) => changeHero(index, { overlay: Number(event.target.value) })} step={5} type="range" value={config.overlay} />
            <span className={ui.hint}>Oscurece la imagen o el video para que el texto se lea bien; entre 40 y 60 % suele funcionar.</span>
          </label>
          <div className={ui.label}>Posición del texto
            <div aria-label="Posición del texto" className="flex border border-ink" role="radiogroup">
              {([["bottom", "Abajo"], ["center", "Centrado"]] as const).map(([value, label]) => <button aria-checked={config.textPosition === value} className={segment(config.textPosition === value)} key={value}
                onClick={() => changeHero(index, { textPosition: value })} role="radio" type="button">{label}</button>)}
            </div>
          </div>
        </>}
      </div>
      <label className="flex items-center gap-2.5 text-[13px] font-medium">
        <input checked={!config.hideButtons} className="size-4 accent-ink" onChange={(event) => changeHero(index, { hideButtons: !event.target.checked })} type="checkbox" />
        Mostrar los botones de compra
      </label>
      <div className="flex flex-col gap-2">
        <span className={ui.eyebrow}>Vista rápida · a la mitad de su tamaño</span>
        <div className="overflow-hidden border border-line bg-white" inert>
          <div style={{ zoom: 0.5 }}><LandingHero audiences={terms.audiences} first framed section={section} title={draft!.title} /></div>
        </div>
      </div>
    </div>;
  }

  function categoriesEditor(section: DraftSection, index: number) {
    const config = section.categories || { layout: "cards" as const, columns: 2, tiles: [] };
    const segment = (selected: boolean) => `h-10 flex-1 px-3 text-[13px] font-medium ${selected ? "bg-ink text-white" : "bg-white hover:bg-soft"}`;
    return <div className="flex flex-col gap-4 bg-soft p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={ui.label}>Diseño
          <div className="flex border border-ink" role="radiogroup" aria-label="Diseño de los bloques">
            {([["cards", "Tarjetas"], ["panels", "Paneles"]] as const).map(([value, label]) =>
              <button aria-checked={config.layout === value} className={segment(config.layout === value)} key={value} onClick={() => changeCategories(index, { layout: value })} role="radio" type="button">{label}</button>)}
          </div>
          <span className={ui.hint}>{config.layout === "cards" ? "Imagen 4:5 con el texto debajo." : "Imagen grande con el texto sobre la foto."}</span>
        </div>
        <div className={ui.label}>Columnas
          <div className="flex border border-ink" role="radiogroup" aria-label="Columnas">
            {[1, 2, 3].map((value) => <button aria-checked={config.columns === value} className={segment(config.columns === value)} key={value}
              onClick={() => changeCategories(index, { columns: value })} role="radio" type="button">{value}</button>)}
          </div>
          <span className={ui.hint}>En celulares los bloques se apilan.</span>
        </div>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {config.tiles.map((tile, tileIndex) => {
          const image = section.media.find((item) => item.id === tile.mediaId);
          const usedElsewhere = new Set(config.tiles.filter((_, other) => other !== tileIndex).map((other) => other.mediaId));
          return <li className="grid gap-4 border border-line bg-white p-3 sm:grid-cols-[120px_1fr]" key={tileIndex}>
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-mist sm:w-[120px]">
              {image && image.url && !image.removed ? <MediaImage alt={image.altText} className="absolute inset-0 h-full w-full object-cover" height={150} sizes="120px" src={thumbnailSrc(image)} width={120} /> :
                <span className="absolute inset-0 flex items-center justify-center p-2 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-graphite">{image?.removed ? "Imagen eliminada" : "Sin imagen"}</span>}
              {image?.kind === "video" && <span className="absolute left-1.5 top-1.5 bg-ink px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-white">Video</span>}
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-graphite">Bloque {String(tileIndex + 1).padStart(2, "0")}</span>
                <span className="flex gap-1.5">
                  <IconButton disabled={tileIndex === 0} icon="up" label="Mover antes" onClick={() => {
                    const tiles = [...config.tiles]; [tiles[tileIndex - 1], tiles[tileIndex]] = [tiles[tileIndex], tiles[tileIndex - 1]]; changeCategories(index, { tiles });
                  }} />
                  <IconButton disabled={tileIndex === config.tiles.length - 1} icon="down" label="Mover después" onClick={() => {
                    const tiles = [...config.tiles]; [tiles[tileIndex + 1], tiles[tileIndex]] = [tiles[tileIndex], tiles[tileIndex + 1]]; changeCategories(index, { tiles });
                  }} />
                  <IconButton icon="delete" label="Quitar bloque" onClick={() => changeCategories(index, { tiles: config.tiles.filter((_, other) => other !== tileIndex) })} tone="danger" />
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className={ui.label}>Texto
                  <input className={ui.input} maxLength={120} onChange={(event) => changeTile(index, tileIndex, { title: event.target.value })} placeholder="Mujer, Deportivo…" value={tile.title} />
                </label>
                <label className={ui.label}>Enlace
                  <select className={ui.input} onChange={(event) => {
                    const [kind, ...value] = event.target.value.split(":");
                    changeTile(index, tileIndex, { linkKind: (kind || "") as CategoryTile["linkKind"], linkValue: value.join(":") });
                  }} value={tile.linkKind ? `${tile.linkKind}:${tile.linkValue}` : ""}>
                    <option value="">Sin enlace</option>
                    {linkGroups.map((group) => group.values.length > 0 && <optgroup key={group.kind} label={group.label}>
                      {group.values.map((value) => <option key={value} value={`${group.kind}:${value}`}>{titleCase(value)}</option>)}
                    </optgroup>)}
                    {tile.linkKind && !linkGroups.find((group) => group.kind === tile.linkKind)?.values.includes(tile.linkValue) &&
                      <option value={`${tile.linkKind}:${tile.linkValue}`}>{tile.linkValue} (sin productos publicados)</option>}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <FileField accept="image/jpeg,image/png,image/webp" disabled={busy} hint="PNG, JPEG o WebP de hasta 8 MiB"
                  label={tile.mediaId ? "Cambiar por una imagen" : "Subir imagen"} onFile={(file) => { if (file) void uploadTileImage(index, tileIndex, file); }} />
                <FileField accept="video/mp4,video/quicktime,video/webm" disabled={busy} hint={`Hasta ${maxVideoSeconds} s y 100 MB, sin sonido`}
                  label={tile.mediaId ? "Cambiar por un video" : "Subir video"} onFile={(file) => {
                    if (file) void uploadVideo(`${section.key}-${tileIndex}`, file, tile.title || section.title, (media) => changeTile(index, tileIndex, { mediaId: media.id }, [media]));
                  }} />
              </div>
              {videoProgress?.key === `${section.key}-${tileIndex}` && <VideoProgress percent={videoProgress.percent} />}
              <select aria-label="Elegir imagen o video del banco" className={`${ui.input} h-auto min-h-11`} onChange={(event) => changeTile(index, tileIndex, { mediaId: Number(event.target.value) })}
                value={tile.mediaId && library.some((item) => item.id === tile.mediaId) ? tile.mediaId : 0}>
                <option value={0}>{tile.mediaId ? "Quitar imagen o video" : "O elegir del banco…"}</option>
                {library.filter((item) => !item.isDeleted && item.purpose !== "qr" && item.purpose !== "logo" && (!usedElsewhere.has(item.id) || item.id === tile.mediaId)).map((item) =>
                  <option key={item.id} value={item.id}>{mediaLabel(item)}</option>)}
              </select>
            </div>
          </li>;
        })}
      </ol>
      <button className={`${ui.secondary} self-start`} disabled={config.tiles.length >= 12} onClick={() => changeCategories(index, { tiles: [...config.tiles, blankTile()] })} type="button">+ Agregar bloque</button>
    </div>;
  }

  // One row of the sections list. Body sections follow the page order; the
  // pinned contact section is always rendered last, as the footer.
  function sectionItem(section: DraftSection, index: number, position: number, total: number, pinned: boolean) {
    const type = sectionTypes.find((item) => item.value === section.type);
    const open = expanded[section.key] ?? false;
    return <li className={`border-l-4 bg-white transition-shadow ${section.isDeleted ? "border-red-600 opacity-60" : section.isVisible ? "border-ink" : "border-[#bdbdbd]"} ${
      open ? "shadow-[0_0_0_2px_#141414,0_16px_40px_rgba(0,0,0,.12)]" : ""}`} key={section.key}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center font-mono text-xs ${section.isVisible && !section.isDeleted ? "bg-ink text-white" : "bg-mist text-graphite"}`}>
          {pinned ? <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M4 19h16M4 15h16" /></svg> : String(position).padStart(2, "0")}</span>
        <button aria-expanded={open} className="flex min-w-0 flex-1 flex-col text-left" onClick={() => setExpanded((current) => ({ ...current, [section.key]: !open }))} type="button">
          <span className="flex flex-wrap items-center gap-2">
            <span className={ui.eyebrow}>{type?.label || section.type}</span>
            {!section.isVisible && !section.isDeleted && <Pill tone="dashed">Oculta</Pill>}
            {section.isDeleted && <Pill tone="danger">Eliminada del borrador</Pill>}
            {section.id === 0 && <Pill tone="soft">Nueva, sin guardar</Pill>}
            {pinned && !section.isDeleted && <Pill tone="outline">{section.type === "suggestions" ? "Sobre el pie de página" : "Siempre al final"}</Pill>}
          </span>
          <span className={`truncate text-[15px] font-semibold ${section.isVisible ? "" : "text-graphite"}`}>{section.title || "Sin título"}</span>
        </button>
        <div className="flex items-center gap-1.5">
          {!pinned && <>
            <IconButton disabled={position === 1} icon="up" label="Subir sección" onClick={() => moveSection(index, -1)} />
            <IconButton disabled={position === total} icon="down" label="Bajar sección" onClick={() => moveSection(index, 1)} />
          </>}
          <IconButton icon={section.isVisible ? "show" : "hide"} label={section.isVisible ? "Visible: pulsa para ocultar" : "Oculta: pulsa para mostrar"}
            onClick={() => changeSection(index, { isVisible: !section.isVisible })} pressed={!section.isVisible} />
          {section.isDeleted ? <IconButton icon="restore" label="Restaurar sección" onClick={() => void toggleSectionTrash(index)} /> :
            <IconButton icon="delete" label="Eliminar sección" onClick={() => void toggleSectionTrash(index)} tone="danger" />}
          <IconButton icon={open ? "close" : "edit"} label={open ? "Cerrar edición" : "Editar sección"} onClick={() => setExpanded((current) => ({ ...current, [section.key]: !open }))} pressed={open} />
        </div>
      </div>
      {open && <div className="border-t-2 border-ink">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink px-4 py-2.5 text-white sm:px-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em]">Editando · {type?.label || section.type}</span>
          {type && <span className="text-xs text-[#bdbdbd]">{type.hint}</span>}
        </div>
        <div className="flex flex-col gap-5 p-4 sm:p-5">
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
        {section.type === "hero" && heroEditor(section, index)}
        {section.type === "suggestions" && <p className="m-0 bg-soft p-4 text-sm text-body">
          El formulario pide nombre, celular de 8 dígitos y qué prendas le gustaría encontrar al cliente. Las respuestas llegan a
          <Link className="ml-1 underline" href="/admin/sugerencias">Sugerencias</Link>.
        </p>}
        {section.type === "categories" && categoriesEditor(section, index)}
        {section.type === "benefits" && benefitsEditor(section, index)}
        {!["categories", "benefits", "hero", "suggestions"].includes(section.type) && <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between"><p className="m-0 text-sm font-semibold">{section.type === "gallery" ? "Imágenes y videos" : "Imágenes"}</p>
            <span className="font-mono text-xs text-graphite">{section.media.length} / 12</span></div>
          {section.media.length > 0 && <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {section.media.map((image) => (
              <div className="flex flex-col gap-1.5" key={image.id}>
                <div className="relative aspect-square overflow-hidden bg-mist">
                  {image.url && !image.removed && <MediaImage alt={image.altText} className="absolute inset-0 h-full w-full object-cover" height={160}
                    sizes="160px" src={thumbnailSrc(image)} width={160} />}
                  {image.kind === "video" && <span className="absolute left-1.5 top-1.5 bg-ink px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-white">Video</span>}
                </div>
                <span className="truncate text-xs" title={image.altText}>{mediaLabel(image)}</span>
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
              <FileField accept="image/jpeg,image/png,image/webp" disabled={busy || section.media.length >= 12} hint="PNG, JPEG o WebP de hasta 8 MiB"
                label="Subir imagen" onFile={(file) => { if (file) void uploadImage(index, file); }} />
              {videoSections.includes(section.type) && <>
                <FileField accept="video/mp4,video/quicktime,video/webm" disabled={busy || section.media.length >= 12} hint={`MP4, MOV o WebM · hasta ${maxVideoSeconds} s y 100 MB, sin sonido`}
                  label="Subir video" onFile={(file) => {
                    if (file) void uploadVideo(section.key, file, altTexts[section.key] || section.title, (media) => changeSection(index, { media: [...section.media, media] }));
                  }} />
                {videoProgress?.key === section.key && <VideoProgress percent={videoProgress.percent} />}
                <span className={ui.hint}>Videos guardados: {library.filter((item) => item.kind === "video").length} de {maxVideos}.</span>
              </>}
            </div>
            <div className="flex flex-col gap-3">
              <label className={ui.label}>O elegir del banco
                <select className={ui.input}
                  onChange={(event) => setSelectedMedia((current) => ({ ...current, [section.key]: Number(event.target.value) }))}
                  value={selectedMedia[section.key] || 0}>
                  <option value={0}>{videoSections.includes(section.type) ? "Selecciona una imagen o un video" : "Selecciona una imagen"}</option>
                  {library.filter((item) => !item.isDeleted && item.purpose !== "qr" && item.purpose !== "logo" && (item.kind !== "video" || videoSections.includes(section.type)) &&
                    !section.media.some((used) => used.id === item.id)).map((item) =>
                    <option key={item.id} value={item.id}>{mediaLabel(item)}</option>)}
                </select>
              </label>
              <button className={`${ui.secondary} self-start`}
                disabled={!selectedMedia[section.key] || section.media.length >= 12}
                onClick={() => {
                  const item = library.find((media) => media.id === selectedMedia[section.key] && !media.isDeleted);
                  if (item) changeSection(index, { media: [...section.media, item] });
                  setSelectedMedia((current) => ({ ...current, [section.key]: 0 }));
                }} type="button">Agregar</button>
            </div>
          </div>
        </div>}
        </div>
      </div>}
    </li>;
  }

  // Indexes into draft.sections, split by where each section is rendered.
  const bodySections = draft.sections.flatMap((section, index) => pinnedTypes.includes(section.type) ? [] : [index]);
  const suggestionSections = draft.sections.flatMap((section, index) => section.type === "suggestions" ? [index] : []);
  const contactSections = draft.sections.flatMap((section, index) => section.type === "contact" ? [index] : []);

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
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className={ui.cardTitle}>Secciones de la página</h2>
              <p className={`${ui.hint} m-0 mt-1`}>Se muestran en este orden, de arriba abajo. Usa las flechas para reordenar y el lápiz para editar.</p></div>
            <span className="flex items-center gap-3 text-xs text-graphite">
              <span className="flex items-center gap-1.5"><span className="h-3 w-1 bg-ink" />Visible</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-1 bg-[#bdbdbd]" />Oculta</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-1 bg-red-600" />En papelera</span>
            </span>
          </div>
          {bodySections.length === 0 ? <EmptyState>Todavía no hay secciones. Agrega una portada para comenzar.</EmptyState> :
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {bodySections.map((index, position) => sectionItem(draft.sections[index], index, position + 1, bodySections.length, false))}
            </ol>}
        </section>

        <section className="flex flex-col gap-3">
          <div><h2 className={ui.cardTitle}>Pie de página</h2>
            <p className={`${ui.hint} m-0 mt-1`}>El buzón de sugerencias aparece en la página de inicio, justo encima del pie. La sección de contacto se muestra siempre al final de todas las páginas de la tienda: inicio, catálogo y ficha de producto. Si la ocultas, el pie muestra el teléfono y las redes de Datos del negocio.</p></div>
          {suggestionSections.length === 0 ? <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-[#bdbdbd] bg-white p-4 text-sm text-graphite">
            Sin buzón de sugerencias: los clientes no pueden pedir prendas desde la página.
            <button className={ui.secondary} onClick={() => addSection("suggestions")} type="button">+ Agregar buzón</button>
          </div> : <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {suggestionSections.map((index, position) => sectionItem(draft.sections[index], index, position + 1, suggestionSections.length, true))}
          </ol>}
          {suggestionSections.length > 1 && <p className="m-0 text-xs text-amber-800">Solo se muestra el primer buzón visible. Elimina los demás para evitar confusiones.</p>}
          {contactSections.length === 0 ? <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-[#bdbdbd] bg-white p-4 text-sm text-graphite">
            Sin sección de contacto: el pie usa el teléfono y las redes de Datos del negocio.
            <button className={ui.secondary} onClick={() => addSection("contact")} type="button">+ Crear contacto</button>
          </div> : <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {contactSections.map((index, position) => sectionItem(draft.sections[index], index, position + 1, contactSections.length, true))}
          </ol>}
          {contactSections.length > 1 && <p className="m-0 text-xs text-amber-800">Solo se muestra la primera sección de contacto visible. Elimina las demás para evitar confusiones.</p>}
        </section>

        <section className="flex flex-col gap-4 border-2 border-dashed border-[#bdbdbd] p-4 sm:p-5">
          <div><h2 className={ui.cardTitle}>Agregar una sección nueva</h2>
            <p className={`${ui.hint} m-0 mt-1`}>Se agrega al final de la lista y se abre para editarla. Los visitantes la verán cuando publiques.</p></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sectionTypes.filter((item) => !pinnedTypes.includes(item.value)).map((item) => (
              <button className="group flex items-start gap-3 border border-line bg-soft p-4 text-left transition-colors hover:border-ink hover:bg-white" key={item.value}
                onClick={() => addSection(item.value)} type="button">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center border border-ink text-lg leading-none transition-colors group-hover:bg-ink group-hover:text-white">+</span>
                <span className="flex flex-col gap-1"><span className="text-sm font-semibold">{item.label}</span>
                  <span className="text-xs text-graphite">{item.hint}</span></span>
              </button>
            ))}
          </div>
        </section>
      </>}
      </fieldset>

      {tab === "preview" && <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] text-graphite">Vista del borrador actual (incluye cambios sin guardar). Solo se muestran las secciones visibles y no eliminadas.</p>
        <div className="overflow-hidden border border-line bg-white">
          <LandingSections landing={draft} preview products={catalogProducts} />
        </div>
      </div>}

      {tab === "history" && <section className={ui.card}>
        <div className="border-b border-line px-5 py-4 sm:px-6"><h2 className={ui.cardTitle}>Historial de publicaciones</h2></div>
        {history.length === 0 ? <p className="m-0 p-6 text-sm text-graphite">Aún no hay versiones publicadas.</p> : (
          <ul className="m-0 list-none p-0">
            {history.map((item, index) => (
              <li className="flex flex-wrap items-center gap-3 border-t border-mist px-5 py-3 text-sm first:border-0 sm:px-6" key={item.version}>
                <span className="w-12 font-mono">v{item.version}</span>
                <span className="min-w-[180px] flex-1 text-graphite">{new Date(item.publishedAt).toLocaleString("es-BO")}{item.username && ` · ${item.username}`}</span>
                {index === 0 && <Pill tone="solid">Pública</Pill>}
                <span className="flex gap-2">
                  <button className={ui.quiet} disabled={busy} onClick={() => void previewVersion(item.version)} type="button">Ver</button>
                  <button className={ui.quiet} disabled={busy} onClick={() => setRestoring(item.version)} type="button">Restaurar como borrador</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>}

      {tab === "history" && versionPreview && <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-[13px] text-graphite">Así se veía la versión {versionPreview.version} al publicarse.</p>
          <span className="flex gap-2">
            <button className={ui.secondary} disabled={busy} onClick={() => setRestoring(versionPreview.version)} type="button">Restaurar como borrador</button>
            <button className={ui.quiet} onClick={() => setVersionPreview(null)} type="button">Cerrar</button>
          </span>
        </div>
        <div className="overflow-hidden border border-line bg-white">
          <LandingSections landing={versionPreview.landing} preview products={catalogProducts} />
        </div>
      </div>}

      {restoring !== null && <ConfirmDialog busy={busy} confirmLabel="Sí, restaurar" onCancel={() => setRestoring(null)}
        onConfirm={() => void restoreVersion(restoring)} title={`Restaurar la versión ${restoring}`}>
        <p className="m-0">El borrador se reemplazará por el contenido de la versión {restoring}. Las secciones actuales que no estaban en esa versión irán a la Papelera, donde puedes recuperarlas.</p>
        {dirty && <p className="m-0 border-l-2 border-amber-600 bg-amber-50 p-3 text-amber-950">Tienes cambios sin guardar en el borrador: se perderán.</p>}
        <p className="m-0 text-xs text-graphite">Los visitantes no verán nada distinto hasta que publiques.</p>
      </ConfirmDialog>}

      <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-3 border border-line bg-white p-3 shadow-lg sm:p-4 lg:bottom-4">
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
