"use client";

import MediaImage from "../../../media-image";
import { useEffect, useState, type FormEvent } from "react";
import TrashActions, { type TrashRef } from "../papelera/trash-actions";
import { ChipRow, EmptyState, FileField, Feedback, Pill, ui } from "../../admin-ui";

type MediaItem = { id: number; url: string; altText: string; isDeleted: boolean;
  useCount: number; purpose: "photo" | "qr"; bytes: number };

function formatBytes(bytes: number): string {
  return bytes < 1_000_000 ? `${(bytes / 1_000).toFixed(0)} kB` : `${(bytes / 1_000_000).toFixed(2)} MB`;
}

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [trashed, setTrashed] = useState<TrashRef | null>(null);
  const [view, setView] = useState("all");

  async function refresh() {
    const response = await fetch("/api/admin/media", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar el banco de imágenes.");
    setItems((await response.json()) as MediaItem[]);
  }

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/media", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo cargar el banco de imágenes.");
        setItems((await response.json()) as MediaItem[]);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "No se pudo cargar el banco.");
      }
    }
    void load();
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("altText", altText);
      const response = await fetch("/api/admin/media", { method: "POST", body });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo subir la imagen.");
      await refresh();
      setFile(null); setAltText("");
      const input = document.querySelector<HTMLInputElement>("#media-upload-file");
      if (input) input.value = "";
      setNotice("Imagen guardada en el banco.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  }

  async function changeTrash(item: MediaItem) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/media/${item.id}${item.isDeleted ? "/restore" : ""}`,
        { method: item.isDeleted ? "POST" : "DELETE" });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo cambiar la papelera.");
      await refresh();
      setTrashed(item.isDeleted ? null : { kind: "media", id: item.id, label: item.altText || `Imagen ${item.id}` });
      setNotice(item.isDeleted ? "Imagen restaurada." : "");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  const visible = (items || []).filter((item) => view === "trash" ? item.isDeleted :
    !item.isDeleted && (view === "all" || item.purpose === view));
  const totalBytes = (items || []).reduce((sum, item) => sum + item.bytes, 0);

  return (
    <div className="flex flex-col gap-5">
      <form className="grid gap-4 bg-white p-5 sm:p-6 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={(event) => void upload(event)}>
        <div className={ui.label}>Imagen *
          <FileField accept="image/png,image/jpeg,image/webp" disabled={busy} fileName={file?.name} hint="PNG, JPEG o WebP de hasta 8 MiB"
            id="media-upload-file" label="Elegir imagen" onFile={setFile} />
          <span className={ui.hint}>Se generan tamaños optimizados al subirla.</span>
        </div>
        <label className={ui.label}>Descripción de la imagen
          <input className={ui.input} maxLength={200} onChange={(event) => setAltText(event.target.value)} placeholder="Texto alternativo" value={altText} />
          <span className={ui.hint}>Se usa como texto alternativo y rótulo en galerías.</span>
        </label>
        <button className={`${ui.primary} md:mb-6`} disabled={busy || !file} type="submit">{busy ? "Subiendo…" : "Subir imagen"}</button>
      </form>
      <Feedback error={error} notice={notice} />
      {trashed && <TrashActions item={trashed} notice onChanged={() => window.location.reload()} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipRow label="Filtrar imágenes">
          {[["all", "Activas"], ["photo", "Fotografías"], ["qr", "Códigos QR"], ["trash", "En papelera"]].map(([value, label]) =>
            <button aria-pressed={view === value} className={`${ui.chip(view === value)} shrink-0`} key={value} onClick={() => setView(value)} type="button">{label}
              <span className="font-mono text-[11px] opacity-70">{(items || []).filter((item) => value === "trash" ? item.isDeleted : !item.isDeleted && (value === "all" || item.purpose === value)).length}</span></button>)}
        </ChipRow>
        <span className="font-mono text-xs text-graphite">{items?.length ?? 0} archivos · {formatBytes(totalBytes)}</span>
      </div>
      {!items ? <p className="text-sm text-graphite">Cargando imágenes…</p> : visible.length === 0 ? <EmptyState>{items.length === 0 ? "Todavía no hay imágenes." : "No hay imágenes en esta vista."}</EmptyState> : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visible.map((item) => <article className={`flex flex-col bg-white ${item.isDeleted ? "opacity-70" : ""}`} key={item.id}>
            <div className={`relative aspect-[4/5] overflow-hidden ${item.purpose === "qr" ? "bg-white" : "bg-mist"}`}>
              <MediaImage alt={item.altText} className={`absolute inset-0 h-full w-full ${item.purpose === "qr" ? "object-contain p-4" : "object-cover"}`}
                height={500} sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw" src={item.url} width={400} />
              <span className="absolute left-2 top-2 bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]">{item.purpose === "qr" ? "QR" : "Foto"}</span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <p className="m-0 truncate text-sm font-medium" title={item.altText}>{item.altText || `Imagen ${item.id}`}</p>
              <p className="m-0 font-mono text-[11px] text-graphite">{formatBytes(item.bytes)} · {item.useCount} uso(s)</p>
              {item.isDeleted && <Pill tone="danger">En papelera</Pill>}
              <button className={`${item.isDeleted ? ui.link : ui.dangerLink} mt-auto self-start pt-1`} disabled={busy}
                onClick={() => void changeTrash(item)} type="button">{item.isDeleted ? "Restaurar" : "Enviar a papelera"}</button>
            </div>
          </article>)}
        </div>
      )}
    </div>
  );
}
