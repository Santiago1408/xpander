"use client";

import { useEffect, useState } from "react";
import TrashActions, { ConfirmPurge, trashKindLabel, type TrashRef } from "./trash-actions";
import { EmptyState, Feedback, Pill, formatDate, ui } from "../../admin-ui";

type TrashItem = TrashRef & { deletedAt: string };

const purgeOrder: Record<string, number> = {
  section: 0, variant: 1, product: 2, media: 3,
};

export default function TrashList() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("all");

  async function refresh() {
    const response = await fetch("/api/admin/trash", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar la papelera.");
    setItems((await response.json()) as TrashItem[]);
  }

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/trash", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo cargar la papelera.");
        setItems((await response.json()) as TrashItem[]);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "No se pudo cargar la papelera.");
      }
    }
    void load();
  }, []);

  async function emptyTrash() {
    if (!items || busy) return;
    setBusy(true); setError(""); setNotice("");
    let deleted = 0;
    let blocked = 0;
    try {
      for (const item of [...items].sort((a, b) => (purgeOrder[a.kind] ?? 99) - (purgeOrder[b.kind] ?? 99))) {
        const response = await fetch(`/api/admin/trash/${item.kind}/${item.id}`, { method: "DELETE" });
        if (response.ok) deleted++;
        else if (response.status === 409 || response.status === 404) blocked++;
        else throw new Error((await response.text()).trim() || "Se interrumpió el vaciado de la papelera.");
      }
      await refresh();
      setNotice(`${deleted} elemento(s) eliminados definitivamente.${blocked ? ` ${blocked} se conservaron por referencias o cambios concurrentes.` : ""}`);
    } catch (failure) {
      await refresh().catch(() => undefined);
      const detail = failure instanceof Error ? failure.message : "No se pudo vaciar la papelera.";
      setError(`${detail} ${deleted} elemento(s) ya se habían eliminado; revisa la lista actualizada.`);
    } finally {
      setConfirmAll(false); setBusy(false);
    }
  }

  const visible = (items || []).filter((item) => kind === "all" || item.kind === kind);
  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 max-w-3xl text-[13px] leading-relaxed text-graphite">Un producto o variante sin pedidos puede eliminarse definitivamente junto con su inventario de prueba. Los pedidos se conservan. Al borrar una imagen, se sustituye por un marcador en todas las publicaciones que la usan, incluso la versión pública actual.</p>
      <Feedback error={error} notice={notice} />
      <section className={ui.card}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5" role="group">
            {["all", "product", "variant", "media", "section"].map((value) => <button aria-pressed={kind === value} className={ui.chip(kind === value)} key={value}
              onClick={() => setKind(value)} type="button">{value === "all" ? "Todo" : trashKindLabel[value]}
              <span className="font-mono text-[11px] opacity-70">{(items || []).filter((item) => value === "all" || item.kind === value).length}</span></button>)}
          </div>
          <button className={`${ui.secondary} ml-auto border-red-700 text-red-700 hover:bg-red-700 hover:text-white`}
            disabled={busy || !items?.length} onClick={() => setConfirmAll(true)} type="button">Vaciar papelera</button>
        </div>
        {!items ? <p className="p-6 text-sm text-graphite">Cargando…</p> : items.length === 0 ? <div className="p-6"><EmptyState>La papelera está vacía.</EmptyState></div> :
          visible.length === 0 ? <p className="p-6 text-sm text-graphite">No hay elementos de este tipo.</p> :
          <ul className="m-0 list-none p-0">
            {visible.map((item) => <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-mist px-5 py-4 first:border-0 sm:px-6" key={`${item.kind}-${item.id}`}>
              <Pill tone="outline">{trashKindLabel[item.kind] || item.kind}</Pill>
              <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="font-mono text-[11px] text-graphite">En papelera desde {formatDate(item.deletedAt)}</span>
              </span>
              <TrashActions item={item} onChanged={refresh} />
            </li>)}
          </ul>}
      </section>
      {confirmAll && <ConfirmPurge busy={busy} label="todos los elementos que puedan borrarse de la papelera" media
        onCancel={() => setConfirmAll(false)} onConfirm={() => void emptyTrash()} />}
    </div>
  );
}
