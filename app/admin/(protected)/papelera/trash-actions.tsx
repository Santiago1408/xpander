"use client";

import { useState } from "react";

export type TrashRef = { kind: string; id: number; label: string };

export const trashKindLabel: Record<string, string> = {
  product: "Producto", variant: "Variante", media: "Imagen", section: "Sección de la landing",
};

export function ConfirmPurge({ label, busy, onCancel, onConfirm }: {
  label: string; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
      <div aria-labelledby="purge-title" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog">
        <h2 className="text-xl font-semibold" id="purge-title">Confirmar eliminación definitiva</h2>
        <p className="mt-3 text-sm text-zinc-700">Se eliminará «{label}» de forma permanente. No se podrá restaurar.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" disabled={busy}
            onClick={onCancel} type="button">Cancelar</button>
          <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy} onClick={onConfirm} type="button">Sí, eliminar definitivamente</button>
        </div>
      </div>
    </div>
  );
}

export default function TrashActions({ item, onChanged, notice = false }: {
  item: TrashRef; onChanged: () => void | Promise<void>; notice?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(method: "POST" | "DELETE") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const suffix = method === "POST" ? "/restore" : "";
      const response = await fetch(`/api/admin/trash/${item.kind}/${item.id}${suffix}`, { method });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo completar la acción.");
      setConfirming(false);
      await onChanged();
    } catch (failure) {
      setConfirming(false);
      setError(failure instanceof Error ? failure.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={notice ? "rounded-lg border border-amber-200 bg-amber-50 p-4" : ""}>
      {notice && <p className="text-sm font-medium text-amber-950">«{item.label}» se envió a la papelera.</p>}
      <div className="mt-2 flex flex-wrap gap-3">
        <button className="text-sm text-blue-800 underline disabled:opacity-50" disabled={busy}
          onClick={() => void act("POST")} type="button">Restaurar</button>
        <button className="text-sm text-red-700 underline disabled:opacity-50" disabled={busy}
          onClick={() => setConfirming(true)} type="button">Eliminar definitivamente</button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      {confirming && <ConfirmPurge busy={busy} label={item.label}
        onCancel={() => setConfirming(false)} onConfirm={() => void act("DELETE")} />}
    </div>
  );
}
