"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import TrashActions, { type TrashRef } from "../papelera/trash-actions";

type MediaItem = { id: number; url: string; altText: string; isDeleted: boolean; useCount: number };

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [trashed, setTrashed] = useState<TrashRef | null>(null);

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

  return (
    <div className="space-y-6">
      <form className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-200 bg-white p-5" onSubmit={(event) => void upload(event)}>
        <label className="text-sm">Imagen PNG o JPEG *
          <input accept="image/png,image/jpeg" className="mt-2 block text-sm" id="media-upload-file"
            onChange={(event) => setFile(event.target.files?.[0] || null)} required type="file" />
        </label>
        <label className="min-w-48 flex-1 text-sm">Descripción de la imagen
          <input className="mt-2 block w-full rounded-lg border border-zinc-300 p-2" maxLength={200}
            onChange={(event) => setAltText(event.target.value)} value={altText} />
        </label>
        <button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy} type="submit">Subir</button>
      </form>
      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
      {trashed && <TrashActions item={trashed} notice onChanged={() => window.location.reload()} />}
      {!items ? <p>Cargando imágenes…</p> : items.length === 0 ? <p>Todavía no hay imágenes.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => <article className={`rounded-xl border border-zinc-200 bg-white p-3 ${item.isDeleted ? "opacity-60" : ""}`} key={item.id}>
            <Image alt={item.altText} className="aspect-[4/3] w-full rounded-lg object-cover"
              height={450} src={item.url} unoptimized width={600} />
            <p className="mt-3 truncate text-sm font-medium">{item.altText || `Imagen ${item.id}`}</p>
            <p className="mt-1 text-xs text-zinc-500">Usos actuales e históricos: {item.useCount}</p>
            {item.isDeleted && <p className="mt-1 text-xs text-red-700">En papelera</p>}
            <button className="mt-3 text-sm text-red-700 underline" disabled={busy}
              onClick={() => void changeTrash(item)} type="button">{item.isDeleted ? "Restaurar" : "Eliminar"}</button>
          </article>)}
        </div>
      )}
    </div>
  );
}
