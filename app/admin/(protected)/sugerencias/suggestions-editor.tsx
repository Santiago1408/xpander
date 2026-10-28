"use client";

import { useEffect, useState } from "react";
import { whatsappHref } from "../../../shop-format";
import { ChipRow, ConfirmDialog, EmptyState, Feedback, Pill, ui } from "../../admin-ui";

type Suggestion = { id: number; name: string; phone: string; message: string; status: "pending" | "done"; createdAt: string };

const filters = [
  { value: "pending", label: "Pendientes" },
  { value: "done", label: "Atendidas" },
  { value: "all", label: "Todas" },
] as const;

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });
}

// Plain text for the owner's restocking trip, newest first.
function shoppingList(items: Suggestion[]) {
  const today = new Date().toLocaleDateString("es-BO");
  return [`Sugerencias pendientes · XPANDER (${today})`, "",
    ...items.map((item, index) => `${index + 1}. ${item.message.replace(/\s*\n\s*/g, " ")}\n   ${item.name} · ${item.phone} · ${shortDate(item.createdAt)}`),
  ].join("\n");
}

export default function SuggestionsEditor() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("pending");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Suggestion | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void fetch("/api/admin/suggestions", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      setItems((await response.json()) as Suggestion[]);
    }).catch(() => setError("No se pudieron cargar las sugerencias."));
  }, []);

  async function changeStatus(item: Suggestion, status: Suggestion["status"]) {
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/suggestions/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error();
      setItems((current) => current && current.map((other) => other.id === item.id ? { ...other, status } : other));
      setNotice(status === "done" ? "Sugerencia marcada como atendida." : "La sugerencia volvió a pendientes.");
    } catch {
      setError("No se pudo cambiar la sugerencia.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: Suggestion) {
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/suggestions/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setItems((current) => current && current.filter((other) => other.id !== item.id));
      setNotice("Sugerencia eliminada.");
    } catch {
      setError("No se pudo eliminar la sugerencia.");
    } finally {
      setBusyId(null); setRemoving(null);
    }
  }

  const all = items || [];
  const pending = all.filter((item) => item.status === "pending");
  const text = query.trim().toLocaleLowerCase("es-BO");
  const visible = all.filter((item) => (filter === "all" || item.status === filter) &&
    (!text || `${item.message} ${item.name} ${item.phone}`.toLocaleLowerCase("es-BO").includes(text)));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  async function copyPending() {
    setError(""); setNotice("");
    try {
      await navigator.clipboard.writeText(shoppingList(pending));
      setNotice(`Se copiaron ${pending.length} sugerencia(s). Pégalas en tus notas o en WhatsApp.`);
    } catch {
      setError("El navegador no permitió copiar. Selecciona el texto de las tarjetas manualmente.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Feedback error={error} notice={notice} />
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[["Pendientes", pending.length], ["Atendidas", all.length - pending.length],
          ["Este mes", all.filter((item) => Date.parse(item.createdAt) >= monthStart).length]].map(([label, value]) =>
          <div className="flex flex-col gap-2 bg-white p-4 sm:p-5" key={label}>
            <span className="text-[13px] text-graphite">{label}</span><span className="font-mono text-xl">{items ? value : "—"}</span>
          </div>)}
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ChipRow label="Filtrar sugerencias">
          {filters.map((item) => <button aria-pressed={filter === item.value} className={`${ui.chip(filter === item.value)} shrink-0`} key={item.value}
            onClick={() => setFilter(item.value)} type="button">{item.label}
            <span className="font-mono text-[11px] opacity-70">{item.value === "all" ? all.length : all.filter((other) => other.status === item.value).length}</span></button>)}
        </ChipRow>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Buscar en sugerencias" className={`${ui.input} sm:w-64`} onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar prenda, marca o cliente" type="search" value={query} />
          <button className={ui.secondary} disabled={pending.length === 0} onClick={() => void copyPending()} type="button">Copiar pendientes</button>
        </div>
      </div>
      {!items ? <p className="text-sm text-graphite">{error ? "" : "Cargando sugerencias…"}</p> : visible.length === 0 ? <EmptyState>
        {all.length === 0 ? "Todavía no hay sugerencias. Llegan desde el buzón de la página de inicio; si no lo ves, agrégalo en Contenido web → Pie de página." :
          text ? "Ninguna sugerencia coincide con la búsqueda." : filter === "pending" ? "No hay sugerencias pendientes." : "No hay sugerencias en esta vista."}
      </EmptyState> : <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 2xl:grid-cols-3">
        {visible.map((item) => {
          const whatsapp = whatsappHref(item.phone);
          const reply = whatsapp && `${whatsapp}?text=${encodeURIComponent(`Hola ${item.name}, te escribimos de XPANDER por tu sugerencia: «${item.message.slice(0, 200)}».`)}`;
          return <li className={`flex flex-col gap-4 border-l-4 bg-white p-4 sm:p-5 ${item.status === "done" ? "border-[#bdbdbd]" : "border-ink"}`} key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-graphite">{shortDate(item.createdAt)}</span>
              {item.status === "done" ? <Pill tone="muted">Atendida</Pill> : <Pill tone="outline">Pendiente</Pill>}
            </div>
            <p className={`m-0 whitespace-pre-line text-[15px] leading-relaxed [overflow-wrap:anywhere] ${item.status === "done" ? "text-graphite" : ""}`}>{item.message}</p>
            <div className="mt-auto flex flex-col gap-3 border-t border-mist pt-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{item.name}</span>
                <a className="font-mono text-[13px] underline-offset-4 hover:underline" href={`tel:${item.phone}`}>{item.phone}</a>
                {reply && <a className="text-[13px] text-graphite underline-offset-4 hover:underline" href={reply} rel="noopener noreferrer" target="_blank">Responder por WhatsApp ↗</a>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={ui.quiet} disabled={busyId === item.id} onClick={() => void changeStatus(item, item.status === "done" ? "pending" : "done")} type="button">
                  {item.status === "done" ? "Volver a pendiente" : "Marcar como atendida"}</button>
                <button className={`${ui.dangerLink} px-2`} disabled={busyId === item.id} onClick={() => setRemoving(item)} type="button">Eliminar</button>
              </div>
            </div>
          </li>;
        })}
      </ol>}
      {removing && <ConfirmDialog busy={busyId === removing.id} confirmLabel="Sí, eliminar" danger onCancel={() => setRemoving(null)}
        onConfirm={() => void remove(removing)} title="Eliminar sugerencia">
        <p className="m-0">Se borrará definitivamente la sugerencia de {removing.name}. No pasa por la Papelera.</p>
      </ConfirmDialog>}
    </div>
  );
}
