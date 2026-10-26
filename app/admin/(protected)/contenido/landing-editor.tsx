"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LandingSections, { type LandingMedia, type LandingSection } from "../../../landing-sections";
import TrashActions, { type TrashRef } from "../papelera/trash-actions";

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
type LibraryMedia = LandingMedia & { isDeleted: boolean };

const sectionTypes = [
  { value: "hero", label: "Portada" },
  { value: "text", label: "Texto informativo" },
  { value: "gallery", label: "Galería" },
  { value: "contact", label: "Contacto" },
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
  const [selectedMedia, setSelectedMedia] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      try {
        const [draftResponse, historyResponse, mediaResponse] = await Promise.all([
          fetch("/api/admin/landing", { cache: "no-store" }),
          fetch("/api/admin/landing/publications", { cache: "no-store" }),
          fetch("/api/admin/media", { cache: "no-store" }),
        ]);
        if (!draftResponse.ok || !historyResponse.ok || !mediaResponse.ok) {
          throw new Error("No se pudo cargar el editor.");
        }
        setDraft((await draftResponse.json()) as Draft);
        setHistory((await historyResponse.json()) as Publication[]);
        setLibrary((await mediaResponse.json()) as LibraryMedia[]);
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
    };
    setDraft((current) => current && { ...current, sections: [...current.sections, section] });
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
      if (!response.ok) throw new Error("No se pudo subir la imagen. Usa PNG/JPEG de hasta 8 MB.");
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
    return <p className="text-zinc-600">{error || "Cargando editor…"}</p>;
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-zinc-500">Contenido público</p>
          <h1 className="mt-2 text-3xl font-semibold">Landing</h1>
          <p className="mt-2 text-zinc-600">
            Edita libremente el borrador. Los visitantes solo verán los cambios al publicar.
          </p>
          <p className="mt-1 text-sm text-zinc-500">Enviar una sección a la papelera guarda también los demás cambios pendientes del borrador.</p>
        </div>
        <Link className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" href="/" target="_blank">
          Abrir landing publicada
        </Link>
      </div>

      <fieldset className="space-y-8" disabled={busy}>
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Datos de la página</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium">
            Título de la página *
            <input className="mt-2 w-full rounded-lg border border-zinc-300 p-3" maxLength={180}
              onChange={(event) => changePage("title", event.target.value)} required value={draft.title} />
          </label>
          <label className="text-sm font-medium">
            Título para buscadores
            <input className="mt-2 w-full rounded-lg border border-zinc-300 p-3" maxLength={180}
              onChange={(event) => changePage("seoTitle", event.target.value)} value={draft.seoTitle} />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Descripción para buscadores
            <textarea className="mt-2 w-full rounded-lg border border-zinc-300 p-3" maxLength={500}
              onChange={(event) => changePage("seoDescription", event.target.value)} rows={2} value={draft.seoDescription} />
          </label>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Secciones</h2>
          <div className="flex flex-wrap gap-2">
            {sectionTypes.map((item) => (
              <button className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                key={item.value} onClick={() => addSection(item.value)} type="button">
                + {item.label}
              </button>
            ))}
          </div>
        </div>
        {draft.sections.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-zinc-600">
            Todavía no hay secciones. Agrega una portada para comenzar.
          </p>
        )}
        {draft.sections.map((section, index) => (
          <article className={`rounded-xl border bg-white p-6 ${section.isDeleted ? "border-red-200 opacity-70" : "border-zinc-200"}`}
            key={section.key}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">
                {sectionTypes.find((item) => item.value === section.type)?.label || section.type}
                {section.isDeleted && <span className="ml-2 text-sm text-red-700">Eliminada del borrador</span>}
              </h3>
              <div className="flex flex-wrap gap-2 text-sm">
                <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={index === 0}
                  onClick={() => moveSection(index, -1)} type="button">Subir</button>
                <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={index === draft.sections.length - 1}
                  onClick={() => moveSection(index, 1)} type="button">Bajar</button>
                <button className="rounded border px-3 py-1" onClick={() => changeSection(index, { isVisible: !section.isVisible })}
                  type="button">{section.isVisible ? "Ocultar" : "Mostrar"}</button>
                <button className="rounded border px-3 py-1" onClick={() => void toggleSectionTrash(index)}
                  type="button">{section.isDeleted ? "Restaurar" : "Eliminar"}</button>
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-medium">Título
                <input className="mt-2 w-full rounded-lg border border-zinc-300 p-3" maxLength={180}
                  onChange={(event) => changeSection(index, { title: event.target.value })} value={section.title} />
              </label>
              <label className="text-sm font-medium">Texto
                <textarea className="mt-2 w-full rounded-lg border border-zinc-300 p-3" maxLength={10000}
                  onChange={(event) => changeSection(index, { body: event.target.value })} rows={4} value={section.body} />
              </label>
            </div>
            <div className="mt-5">
              <p className="text-sm font-medium">Imágenes</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {section.media.map((image) => (
                  <div className="rounded-lg border border-zinc-200 p-2 text-sm" key={image.id}>
                    <span className="block max-w-40 truncate">{image.altText || `Imagen ${image.id}`}</span>
                    <button className="mt-1 text-red-700 underline" onClick={() => changeSection(index,
                      { media: section.media.filter((item) => item.id !== image.id) })} type="button">Quitar</button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium">Texto alternativo
                  <input className="mt-2 block rounded-lg border border-zinc-300 p-2" maxLength={200}
                    onChange={(event) => setAltTexts((current) => ({ ...current, [section.key]: event.target.value }))}
                    placeholder="Describe la imagen" value={altTexts[section.key] || ""} />
                </label>
                <label className="text-sm font-medium">Subir PNG o JPEG
                  <input accept="image/jpeg,image/png" className="mt-2 block text-sm" disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(index, file);
                      event.target.value = "";
                    }} type="file" />
                </label>
                <label className="text-sm font-medium">Elegir del banco
                  <select className="mt-2 block rounded-lg border border-zinc-300 p-2"
                    onChange={(event) => setSelectedMedia((current) => ({ ...current, [section.key]: Number(event.target.value) }))}
                    value={selectedMedia[section.key] || 0}>
                    <option value={0}>Selecciona una imagen</option>
                    {library.filter((item) => !item.isDeleted && !section.media.some((used) => used.id === item.id)).map((item) =>
                      <option key={item.id} value={item.id}>{item.altText || `Imagen ${item.id}`}</option>)}
                  </select>
                </label>
                <button className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  disabled={!selectedMedia[section.key] || section.media.length >= 12}
                  onClick={() => {
                    const item = library.find((media) => media.id === selectedMedia[section.key] && !media.isDeleted);
                    if (item) changeSection(index, { media: [...section.media, item] });
                    setSelectedMedia((current) => ({ ...current, [section.key]: 0 }));
                  }} type="button">Agregar imagen</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      </fieldset>

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
        <button className="rounded-lg border border-zinc-950 px-5 py-3 font-medium disabled:opacity-50"
          disabled={busy || !dirty} onClick={() => void saveClick()} type="button">Guardar borrador</button>
        <button className="rounded-lg bg-zinc-950 px-5 py-3 font-medium text-white disabled:opacity-50"
          disabled={busy} onClick={() => void publish()} type="button">Publicar</button>
        <span className="text-sm text-zinc-600">
          {busy ? "Procesando…" : dirty ? "Cambios sin guardar" : `Borrador guardado · versión pública ${draft.publishedVersion || "ninguna"}`}
        </span>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
      {trashed && <TrashActions item={trashed} notice onChanged={() => window.location.reload()} />}

      <div>
        <h2 className="text-xl font-semibold">Vista previa del borrador</h2>
        <p className="mt-2 text-sm text-zinc-600">Solo se muestran las secciones visibles y no eliminadas.</p>
        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <LandingSections landing={draft} />
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Historial de publicaciones</h2>
        {history.length === 0 ? <p className="mt-3 text-zinc-600">Aún no hay versiones publicadas.</p> : (
          <ul className="mt-4 space-y-2 text-sm text-zinc-600">
            {history.map((item) => (
              <li key={item.version}>Versión {item.version} · {new Date(item.publishedAt).toLocaleString("es-BO")}
                {item.username && ` · ${item.username}`}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
