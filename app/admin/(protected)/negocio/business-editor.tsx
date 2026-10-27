"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { socialPlatforms } from "../../../social-platforms";
import { Feedback, Pill, ui } from "../../admin-ui";

type Profile = { phone: string; socialLinks: Record<string, string>; qrMediaId: number | null; qrUrl: string; qrExpiresOn: string };
type Media = { id: number; altText: string; isDeleted: boolean; purpose: "photo" | "qr" };

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
      form.append("purpose", "qr");
      const response = await fetch("/api/admin/media", { method: "POST", body: form });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo subir el QR.");
      const image = (await response.json()) as { id: number; url: string };
      setProfile({ ...profile, qrMediaId: image.id, qrUrl: image.url, qrExpiresOn: suggestedExpiry() });
      setLibrary((items) => [{ id: image.id, altText: "Código QR para transferencia bancaria", isDeleted: false, purpose: "qr" }, ...items]);
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

  if (!profile) return <p className="text-sm text-graphite" role={error ? "alert" : undefined}>{error || "Cargando datos…"}</p>;
  const today = dateString(new Date());
  const qrExpired = Boolean(profile.qrMediaId && profile.qrExpiresOn && profile.qrExpiresOn < today);
  return <form className="flex flex-col gap-5" onSubmit={(event) => void save(event)}>
    <Feedback error={error} notice={notice} />
    <fieldset className="m-0 grid items-start gap-4 border-0 p-0 xl:grid-cols-[minmax(0,1fr)_400px]" disabled={busy}>
      <section className={`${ui.card} ${ui.cardPad} flex flex-col gap-5`}>
        <div>
          <h2 className={ui.cardTitle}>Contacto</h2>
          <p className={`${ui.hint} mt-1`}>El teléfono se muestra en el pie de la tienda. El número que recibe los pedidos por WhatsApp se configura en el servidor y no cambia aquí.</p>
        </div>
        <label className={`${ui.label} max-w-sm`}>Teléfono *
          <input className={`${ui.input} font-mono`} maxLength={40} required type="tel"
            onChange={(event) => setProfile({ ...profile, phone: event.target.value })} value={profile.phone} />
        </label>
        <div className="border-t border-line pt-5">
          <h3 className="m-0 text-sm font-semibold">Redes sociales del negocio</h3>
          <p className={`${ui.hint} mt-1`}>Solo se muestran los enlaces completados. Deben empezar con https://.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {socialPlatforms.map(({ key, label }) => <label className={ui.label} key={key}>{label}
              <input className={ui.input} placeholder="https://..." type="url"
                onChange={(event) => setProfile({ ...profile, socialLinks: { ...profile.socialLinks, [key]: event.target.value } })}
                value={profile.socialLinks[key] || ""} />
            </label>)}
          </div>
        </div>
      </section>
      <section className={`${ui.card} ${ui.cardPad} flex flex-col gap-4 xl:sticky xl:top-6`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className={ui.cardTitle}>QR de transferencia</h2>
          {profile.qrMediaId ? <Pill tone={qrExpired ? "danger" : "solid"}>{qrExpired ? "Vencido" : "Configurado"}</Pill> : <Pill tone="dashed">Sin QR</Pill>}
        </div>
        <p className={`${ui.hint} m-0`}>Hay un solo QR vigente. Indica la fecha real de vencimiento del banco. Cambiarlo aquí no verifica pagos automáticamente.</p>
        <div className="flex aspect-square items-center justify-center border border-line bg-white p-4">
          {profile.qrMediaId ? <Image alt="QR bancario actual" className="max-h-full w-auto object-contain"
            height={320} src={profile.qrUrl || `/api/admin/media/${profile.qrMediaId}`} unoptimized width={320} /> :
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-graphite">Sin QR activo</span>}
        </div>
        <label className={ui.label}>Subir QR PNG, JPEG o WebP
          <input accept="image/png,image/jpeg,image/webp" className={ui.file} type="file"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
        </label>
        <label className={ui.label}>O elegir del banco
          <select className={ui.input}
            onChange={(event) => {
              const id = Number(event.target.value) || null;
              setProfile({ ...profile, qrMediaId: id, qrUrl: id ? `/api/admin/media/${id}` : "",
                qrExpiresOn: id ? suggestedExpiry() : "" });
            }} value={profile.qrMediaId || 0}>
            <option value={0}>Sin QR</option>
            {library.filter((image) => !image.isDeleted && image.purpose === "qr").map((image) => <option key={image.id} value={image.id}>{image.altText || `Imagen ${image.id}`}</option>)}
          </select>
        </label>
        {profile.qrMediaId && <>
          <label className={ui.label}>Vencimiento del QR *
            <input className={`${ui.input} font-mono`} max={suggestedExpiry()} min={today} required type="date"
              onChange={(event) => setProfile({ ...profile, qrExpiresOn: event.target.value })}
              value={profile.qrExpiresOn || ""} />
          </label>
          <button className={`${ui.dangerLink} self-start`} type="button"
            onClick={() => setProfile({ ...profile, qrMediaId: null, qrUrl: "", qrExpiresOn: "" })}>Quitar QR</button>
        </>}
      </section>
    </fieldset>
    <div className="sticky bottom-20 z-30 flex flex-wrap items-center gap-3 border border-line bg-white p-4 shadow-lg lg:bottom-4">
      <button className={ui.primary} disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar cambios"}</button>
      <span className="text-[13px] text-graphite">Los cambios se aplican al guardar; no requieren publicar la landing.</span>
    </div>
  </form>;
}
