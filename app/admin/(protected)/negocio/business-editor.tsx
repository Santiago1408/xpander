"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { mobileDigits } from "../../../shop-format";
import { socialPlatforms } from "../../../social-platforms";
import { FileField, Feedback, Pill, ui } from "../../admin-ui";

type Profile = {
  phone: string; socialLinks: Record<string, string>; qrMediaId: number | null; qrUrl: string; qrExpiresOn: string;
  logoWordmarkMediaId: number | null; logoMarkMediaId: number | null;
};
type Media = { id: number; altText: string; isDeleted: boolean; purpose: "photo" | "qr" | "logo" };
type LogoSlot = "logoWordmarkMediaId" | "logoMarkMediaId";

// While no logo is chosen the store uses these bundled files.
const logoSlots: { key: LogoSlot; title: string; hint: string; fallback: string; alt: string }[] = [
  { key: "logoWordmarkMediaId", title: "Logotipo", alt: "Logotipo de la tienda", fallback: "/brand/xpander-wordmark.png",
    hint: "El nombre de la tienda. Aparece en el encabezado, el carrito, el acceso al panel y el Generador." },
  { key: "logoMarkMediaId", title: "Isotipo", alt: "Isotipo de la tienda", fallback: "/brand/xpander-x.png",
    hint: "El símbolo. Aparece en el panel, en las fichas sin foto, en el Generador y como ícono de la pestaña del navegador." },
];

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
  const [allNetworks, setAllNetworks] = useState(false);

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

  async function uploadLogo(slot: LogoSlot, title: string, file: File) {
    if (!profile || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("altText", `${title} de la tienda`);
      form.append("purpose", "logo");
      const response = await fetch("/api/admin/media", { method: "POST", body: form });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo subir el logo.");
      const image = (await response.json()) as { id: number };
      setProfile({ ...profile, [slot]: image.id });
      setLibrary((items) => [{ id: image.id, altText: `${title} de la tienda`, isDeleted: false, purpose: "logo" }, ...items]);
      setNotice(`${title} cargado. Pulsa Guardar cambios para usarlo en la tienda.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo subir el logo."); }
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
          qrMediaId: profile.qrMediaId, qrExpiresOn: profile.qrExpiresOn,
          logoWordmarkMediaId: profile.logoWordmarkMediaId, logoMarkMediaId: profile.logoMarkMediaId }) });
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
    <fieldset className="m-0 grid grid-cols-1 items-start gap-4 border-0 p-0 xl:grid-cols-[minmax(0,1fr)_400px]" disabled={busy}>
      <div className="flex min-w-0 flex-col gap-4">
      <section className={`${ui.card} ${ui.cardPad} flex flex-col gap-5`}>
        <div>
          <h2 className={ui.cardTitle}>Contacto</h2>
          <p className={`${ui.hint} mt-1`}>El teléfono se muestra en el pie de la tienda. El número que recibe los pedidos por WhatsApp se configura en el servidor y no cambia aquí.</p>
        </div>
        <label className={`${ui.label} max-w-sm`}>Teléfono *
          <input className={`${ui.input} font-mono`} inputMode="numeric" minLength={7} pattern="[0-9]{7,8}" placeholder="71234567" required
            title="7 u 8 dígitos, sin el código de país" type="tel"
            onChange={(event) => setProfile({ ...profile, phone: mobileDigits(event.target.value) })} value={profile.phone} />
        </label>
        <div className="border-t border-line pt-5">
          <h3 className="m-0 text-sm font-semibold">Redes sociales del negocio</h3>
          <p className={`${ui.hint} mt-1`}>Solo se muestran los enlaces completados. Deben empezar con https://.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {socialPlatforms.filter(({ key }) => allNetworks || profile.socialLinks[key] || ["instagram", "facebook", "tiktok", "whatsapp"].includes(key)).map(({ key, label }) => <label className={ui.label} key={key}>{label}
              <input className={ui.input} placeholder="https://..." type="url"
                onChange={(event) => setProfile({ ...profile, socialLinks: { ...profile.socialLinks, [key]: event.target.value } })}
                value={profile.socialLinks[key] || ""} />
            </label>)}
          </div>
          {!allNetworks && <button className={`${ui.link} mt-4`} onClick={() => setAllNetworks(true)} type="button">Mostrar todas las redes</button>}
        </div>
      </section>

      <section className={`${ui.card} ${ui.cardPad} flex flex-col gap-5`}>
        <div>
          <h2 className={ui.cardTitle}>Logos de la tienda</h2>
          <p className={`${ui.hint} mt-1`}>Usa un PNG o WebP con fondo transparente y el logo en un solo color oscuro: en las franjas oscuras de la tienda se muestra en blanco. Mientras no elijas uno, se usan los logos originales de XPANDER.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {logoSlots.map((slot) => {
            const current = profile[slot.key];
            const src = current ? `/api/admin/media/${current}` : slot.fallback;
            return <div className="flex min-w-0 flex-col gap-3" key={slot.key}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-sm font-semibold">{slot.title}</h3>
                {current ? <Pill tone="solid">Personalizado</Pill> : <Pill tone="dashed">Por defecto</Pill>}
              </div>
              <p className={`${ui.hint} m-0`}>{slot.hint}</p>
              <div className="grid grid-cols-2 border border-line">
                <div className="flex h-24 items-center justify-center bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- logo preview at its own proportions */}
                  <img alt={`${slot.alt} sobre fondo claro`} className="max-h-full max-w-full object-contain" src={src} />
                </div>
                <div className="flex h-24 items-center justify-center bg-ink p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- logo preview at its own proportions */}
                  <img alt={`${slot.alt} sobre fondo oscuro`} className="max-h-full max-w-full object-contain [filter:brightness(0)_invert(1)]" src={src} />
                </div>
              </div>
              <FileField accept="image/png,image/webp" disabled={busy} hint="PNG o WebP con fondo transparente"
                label={current ? `Reemplazar ${slot.title.toLocaleLowerCase("es-BO")}` : `Subir ${slot.title.toLocaleLowerCase("es-BO")}`}
                onFile={(file) => { if (file) void uploadLogo(slot.key, slot.title, file); }} />
              {library.some((image) => !image.isDeleted && image.purpose === "logo") && <label className={ui.label}>O elegir un logo subido antes
                <select className={ui.input} onChange={(event) => setProfile({ ...profile, [slot.key]: Number(event.target.value) || null })} value={current || 0}>
                  <option value={0}>Logo original de XPANDER</option>
                  {library.filter((image) => !image.isDeleted && image.purpose === "logo").map((image) =>
                    <option key={image.id} value={image.id}>{image.altText || `Logo ${image.id}`}</option>)}
                </select>
              </label>}
              {current && <button className={`${ui.link} self-start`} onClick={() => setProfile({ ...profile, [slot.key]: null })} type="button">Volver al logo por defecto</button>}
            </div>;
          })}
        </div>
      </section>
      </div>
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
        <FileField accept="image/png,image/jpeg,image/webp" disabled={busy} hint="PNG, JPEG o WebP del QR de tu banco"
          label={profile.qrMediaId ? "Reemplazar QR" : "Subir QR"} onFile={(file) => { if (file) void upload(file); }} />
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
    <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-3 border border-line bg-white p-3 shadow-lg sm:p-4 lg:bottom-4">
      <button className={ui.primary} disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar cambios"}</button>
      <span className="text-[13px] text-graphite">Los cambios se aplican al guardar; no requieren publicar la landing.</span>
    </div>
  </form>;
}
