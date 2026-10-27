"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { socialPlatforms } from "../../../social-platforms";

type Profile = { phone: string; socialLinks: Record<string, string>; qrMediaId: number | null; qrUrl: string; qrExpiresOn: string };
type Media = { id: number; altText: string; isDeleted: boolean };

function dateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function suggestedExpiry(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return dateString(date);
}

export default function BusinessEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [library, setLibrary] = useState<Media[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [current, images] = await Promise.all([
          fetch("/api/admin/business", { cache: "no-store" }),
          fetch("/api/admin/media", { cache: "no-store" }),
        ]);
        if (!current.ok || !images.ok) throw new Error("No se pudieron cargar los datos del negocio.");
        setProfile((await current.json()) as Profile);
        setLibrary((await images.json()) as Media[]);
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Error al cargar."); }
    })();
  }, []);

  async function upload(file: File) {
    if (!profile || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("altText", "Código QR para transferencia bancaria");
      const response = await fetch("/api/admin/media", { method: "POST", body: form });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo subir el QR.");
      const image = (await response.json()) as { id: number; url: string };
      setProfile({ ...profile, qrMediaId: image.id, qrUrl: image.url, qrExpiresOn: suggestedExpiry() });
      setLibrary((items) => [{ id: image.id, altText: "Código QR para transferencia bancaria", isDeleted: false }, ...items]);
      setNotice("QR cargado. Pulsa Guardar cambios para activarlo.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo subir el QR."); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/business", { method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.phone, socialLinks: profile.socialLinks,
          qrMediaId: profile.qrMediaId, qrExpiresOn: profile.qrExpiresOn }) });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo guardar.");
      setProfile((await response.json()) as Profile);
      setNotice("Datos del negocio guardados.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }

  if (!profile) return <p role={error ? "alert" : undefined}>{error || "Cargando datos…"}</p>;
  return <form className="space-y-7" onSubmit={(event) => void save(event)}>
    <fieldset className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6" disabled={busy}>
      <label className="block text-sm font-medium">Teléfono *
        <input className="mt-2 w-full rounded-lg border border-zinc-300 p-3" maxLength={40} required type="tel"
          onChange={(event) => setProfile({ ...profile, phone: event.target.value })} value={profile.phone} />
      </label>
      <div>
        <h2 className="font-semibold">Redes sociales del negocio</h2>
        <p className="mt-1 text-sm text-zinc-500">Solo se mostrarán los enlaces que completes en las funciones públicas que los usen.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {socialPlatforms.map(({ key, label }) => <label className="text-sm font-medium" key={key}>{label}
            <input className="mt-2 w-full rounded-lg border border-zinc-300 p-3" placeholder="https://..." type="url"
              onChange={(event) => setProfile({ ...profile, socialLinks: { ...profile.socialLinks, [key]: event.target.value } })}
              value={profile.socialLinks[key] || ""} />
          </label>)}
        </div>
      </div>
      <div>
        <h2 className="font-semibold">QR de transferencia bancaria</h2>
        <p className="mt-1 text-sm text-zinc-500">Hay un solo QR vigente. Indica la fecha real de vencimiento del banco; al renovarlo, reemplaza la imagen y la fecha. Cambiarlo aquí no verifica pagos automáticamente.</p>
        {profile.qrMediaId && <Image alt="QR bancario actual" className="mt-4 max-h-64 w-auto rounded-lg border object-contain"
          height={256} src={profile.qrUrl || `/api/admin/media/${profile.qrMediaId}`} unoptimized width={256} />}
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm">Subir QR PNG o JPEG
            <input accept="image/png,image/jpeg" className="mt-2 block text-sm" type="file"
              onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
          </label>
          <label className="text-sm">Elegir del banco
            <select className="mt-2 block rounded-lg border border-zinc-300 p-2"
              onChange={(event) => {
                const id = Number(event.target.value) || null;
                setProfile({ ...profile, qrMediaId: id, qrUrl: id ? `/api/admin/media/${id}` : "",
                  qrExpiresOn: id ? suggestedExpiry() : "" });
              }} value={profile.qrMediaId || 0}>
              <option value={0}>Sin QR</option>
              {library.filter((image) => !image.isDeleted).map((image) => <option key={image.id} value={image.id}>{image.altText || `Imagen ${image.id}`}</option>)}
            </select>
          </label>
          {profile.qrMediaId && <button className="text-sm text-red-700 underline" type="button"
            onClick={() => setProfile({ ...profile, qrMediaId: null, qrUrl: "", qrExpiresOn: "" })}>Quitar QR</button>}
        </div>
        {profile.qrMediaId && <label className="mt-4 block max-w-xs text-sm font-medium">Vencimiento del QR *
          <input className="mt-2 w-full rounded-lg border border-zinc-300 p-3" max={suggestedExpiry()}
            min={dateString(new Date())} required type="date"
            onChange={(event) => setProfile({ ...profile, qrExpiresOn: event.target.value })}
            value={profile.qrExpiresOn || ""} />
        </label>}
      </div>
    </fieldset>
    <button className="rounded-lg bg-zinc-950 px-5 py-3 font-medium text-white disabled:opacity-50" disabled={busy} type="submit">Guardar cambios</button>
    {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
  </form>;
}
