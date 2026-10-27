"use client";

import { useState } from "react";
import { Modal, ui } from "../../admin-ui";

export type TrashRef = { kind: string; id: number; label: string };

export const trashKindLabel: Record<string, string> = {
  product: "Producto", variant: "Variante", media: "Imagen", section: "Sección de la landing",
};

export function ConfirmPurge({ label, busy, onCancel, onConfirm, media = false }: {
  label: string; busy: boolean; onCancel: () => void; onConfirm: () => void; media?: boolean;
}) {
  return (
    <Modal labelledBy="purge-title" onClose={() => !busy && onCancel()} title="Eliminar definitivamente">
        <p className="mt-3 text-sm text-body">Se eliminará «{label}» de forma permanente. No se podrá restaurar.</p>
        {media && <p className="mt-3 border-l-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-900">Si la imagen aparece en publicaciones históricas, allí se reemplazará por «Imagen eliminada». También dejará de mostrarse si está en la versión pública actual o si era el QR activo.</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button className={ui.secondary} disabled={busy}
            onClick={onCancel} type="button">Cancelar</button>
          <button className={ui.danger}
            disabled={busy} onClick={onConfirm} type="button">Sí, eliminar definitivamente</button>
        </div>
    </Modal>
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
    <div className={notice ? "flex flex-wrap items-center gap-x-5 gap-y-2 border-l-2 border-ink bg-white p-4" : ""}>
      {notice && <p className="m-0 mr-auto text-sm font-medium">«{item.label}» se envió a la papelera.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className={ui.quiet} disabled={busy}
          onClick={() => void act("POST")} type="button">Restaurar</button>
        <button className={ui.dangerLink} disabled={busy}
          onClick={() => setConfirming(true)} type="button">Eliminar definitivamente</button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      {confirming && <ConfirmPurge busy={busy} label={item.label} media={item.kind === "media"}
        onCancel={() => setConfirming(false)} onConfirm={() => void act("DELETE")} />}
    </div>
  );
}
