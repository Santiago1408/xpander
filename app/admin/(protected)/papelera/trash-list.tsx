"use client";

import { useEffect, useState } from "react";
import TrashActions, { ConfirmPurge, trashKindLabel, type TrashRef } from "./trash-actions";

type TrashItem = TrashRef & { deletedAt: string };

const purgeOrder: Record<string, number> = {
  section: 0, variant: 1, product: 2, option: 3, attribute: 4,
  brand: 5, color: 5, category: 6, media: 7,
};

export default function TrashList() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-600">Los elementos con pedidos, movimientos u otras referencias se conservan hasta resolver esas dependencias. El borrado de una sección no altera las publicaciones históricas.</p>
      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
      <button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
        disabled={busy || !items?.length} onClick={() => setConfirmAll(true)} type="button">Vaciar papelera</button>
      {!items ? <p>Cargando…</p> : items.length === 0 ? <p>La papelera está vacía.</p> : (
        <ul className="space-y-3">
          {items.map((item) => <li className="rounded-xl border border-zinc-200 bg-white p-4" key={`${item.kind}-${item.id}`}>
            <p className="font-medium">{trashKindLabel[item.kind] || item.kind}: {item.label}</p>
            <p className="mt-1 text-xs text-zinc-500">En papelera desde {new Date(item.deletedAt).toLocaleString("es-BO")}</p>
            <TrashActions item={item} onChanged={refresh} />
          </li>)}
        </ul>
      )}
      {confirmAll && <ConfirmPurge busy={busy} label="todos los elementos que puedan borrarse de la papelera"
        onCancel={() => setConfirmAll(false)} onConfirm={() => void emptyTrash()} />}
    </div>
  );
}
