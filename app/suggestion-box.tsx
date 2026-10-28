"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { mobileDigits, mobilePattern } from "./shop-format";

const field = "h-12 w-full border border-line bg-white px-3.5 text-[15px] outline-none focus:border-ink disabled:bg-soft";

// The landing's suggestion box, just above the footer: customers ask for the
// garments they would like the store to bring.
export default function SuggestionBox({ id, title, body, preview = false }: {
  id?: string; title: string; body: string; preview?: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || preview) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/suggestions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone, message: message.trim(), website }),
      });
      if (!response.ok) throw new Error(response.status === 429 || response.status === 400 ?
        (await response.text()).trim() : "No se pudo enviar tu sugerencia. Inténtalo de nuevo.");
      setSent(true); setName(""); setPhone(""); setMessage("");
    } catch (failure) {
      const text = failure instanceof Error ? failure.message : "";
      setError(text ? text.charAt(0).toLocaleUpperCase("es-BO") + text.slice(1) + (text.endsWith(".") ? "" : ".") :
        "No se pudo enviar tu sugerencia. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="xp-container pb-[clamp(56px,7vw,112px)]" id={id}>
      <div className="grid gap-10 border-t border-ink pt-10 lg:grid-cols-[5fr_7fr] lg:gap-[clamp(40px,6vw,96px)]">
        <div className="flex flex-col gap-5">
          <span className="xp-label text-graphite">Buzón de sugerencias</span>
          <h2 className="xp-display m-0 text-[clamp(32px,4vw,56px)] leading-[0.95] tracking-[-0.01em] [overflow-wrap:anywhere]">
            {title || "¿Qué prenda te gustaría encontrar?"}</h2>
          <p className="m-0 max-w-[440px] whitespace-pre-line text-[15px] leading-relaxed text-graphite">
            {body || "Cuéntanos qué buscas: marca, modelo, talla o color. Lo tendremos en cuenta en nuestra próxima compra y te escribiremos si lo conseguimos."}</p>
        </div>
        {sent ? <div className="flex flex-col items-start gap-4 self-start bg-soft p-6 sm:p-8" role="status">
          <span aria-hidden="true" className="flex size-10 items-center justify-center bg-ink text-white">
            <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <p className="m-0 text-lg font-semibold">¡Gracias! Recibimos tu sugerencia.</p>
          <p className="m-0 text-[15px] leading-relaxed text-graphite">Si conseguimos lo que buscas, te avisaremos por WhatsApp.</p>
          <button className="text-sm font-medium underline underline-offset-4" onClick={() => setSent(false)} type="button">Enviar otra sugerencia</button>
        </div> : <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">Nombre *
              <input autoComplete="name" className={field} disabled={busy} maxLength={80}
                onChange={(event) => setName(event.target.value)} placeholder="Tu nombre" required value={name} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">Celular *
              <input autoComplete="tel-national" className={`${field} font-mono`} disabled={busy} inputMode="numeric"
                onChange={(event) => setPhone(mobileDigits(event.target.value))} pattern={mobilePattern} placeholder="71234567"
                required title="8 dígitos, empieza con 6 o 7" type="tel" value={phone} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">¿Qué te gustaría ver en la tienda? *
            <textarea className="min-h-32 w-full border border-line bg-white p-3.5 text-[15px] leading-relaxed outline-none focus:border-ink disabled:bg-soft"
              disabled={busy} maxLength={1000} minLength={3} onChange={(event) => setMessage(event.target.value)}
              placeholder="Ej.: zapatillas Nike Air Force blancas, talla 40" required rows={4} value={message} />
          </label>
          {/* Hidden from people; automated spam tends to fill it. */}
          <label aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">Sitio web
            <input autoComplete="off" onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} value={website} />
          </label>
          {error && <p className="m-0 border-l-2 border-red-700 bg-red-50 p-3 text-sm text-red-900" role="alert">{error}</p>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button className="xp-btn h-12 bg-ink px-8 tracking-[0.08em] text-white hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={busy || preview} type="submit">{busy ? "Enviando…" : "Enviar sugerencia"}</button>
            <p className="m-0 text-xs leading-relaxed text-graphite">Usamos tu nombre y celular solo para responderte
              (<Link className="underline underline-offset-2 hover:text-ink" href="/privacidad">privacidad</Link>).</p>
          </div>
        </form>}
      </div>
    </section>
  );
}
