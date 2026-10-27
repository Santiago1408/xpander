"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Feedback, Modal, ui } from "../../../admin-ui";

type Brand = { id: number; name: string; productCount: number };

export default function BrandEditor() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/catalog/brands", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudieron cargar las marcas.");
    setBrands((await response.json()) as Brand[]);
  }

  useEffect(() => {
    void (async () => { try { await refresh(); } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudieron cargar las marcas.");
    } })();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(editing ? `/api/admin/catalog/brands/${editing.id}` : "/api/admin/catalog/brands", {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo guardar la marca.");
      await refresh();
      setEditing(null); setName(""); setNotice("Marca guardada.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar la marca.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/catalog/brands/${deleting.id}?confirm=1&expectedCount=${deleting.productCount}`, { method: "DELETE" });
      if (response.status === 409) {
        const detail = (await response.json()) as { productCount: number; message: string };
        setDeleting({ ...deleting, productCount: detail.productCount });
        throw new Error("El número de productos cambió. Revisa la advertencia y confirma de nuevo.");
      }
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo eliminar la marca.");
      await refresh(); setDeleting(null);
      if (editing?.id === deleting.id) { setEditing(null); setName(""); }
      setNotice("Marca eliminada. Los productos que la usaban permanecen registrados sin marca.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo eliminar la marca.");
    } finally { setBusy(false); }
  }

  return <section className={`${ui.card} flex flex-col`}>
    <div className="border-b border-line px-5 py-4 sm:px-6">
      <h2 className={ui.cardTitle}>Marcas</h2>
      <p className={`${ui.hint} mt-1`}>La marca es opcional en cada ficha. Se guardan en mayúsculas.</p>
    </div>
    <form className="flex flex-col gap-3 px-5 py-4 sm:px-6" onSubmit={(event) => void save(event)}>
      <label className={ui.label}>{editing ? `Modificar «${editing.name}»` : "Nueva marca"}
        <span className="flex gap-2">
          <input className={ui.input} disabled={busy} maxLength={120} onChange={(event) => setName(event.target.value.toLocaleUpperCase("es-BO"))}
            placeholder="ADIDAS" required value={name} />
          <button className={ui.primary} disabled={busy} type="submit">{editing ? "Guardar" : "Agregar"}</button>
        </span>
      </label>
      {editing && <button className={`${ui.link} self-start`} disabled={busy} onClick={() => { setEditing(null); setName(""); }} type="button">Cancelar edición</button>}
      <Feedback error={error} notice={notice} />
    </form>
    {brands.length === 0 ? <p className="m-0 px-5 pb-5 text-sm text-graphite sm:px-6">Aún no hay marcas.</p> :
      <ul className="m-0 list-none p-0">{brands.map((brand) => <li className={`flex items-center gap-3 border-t border-mist px-5 py-3 sm:px-6 ${editing?.id === brand.id ? "bg-soft" : ""}`} key={brand.id}>
        <span className="mr-auto flex flex-col"><span className="text-sm font-medium">{brand.name}</span>
          <span className="font-mono text-[11px] text-graphite">{brand.productCount} producto(s)</span></span>
        <button className={ui.quiet} disabled={busy} onClick={() => { setEditing(brand); setName(brand.name); setError(""); }} type="button">Editar</button>
        <button className={ui.dangerLink} disabled={busy} onClick={() => setDeleting(brand)} type="button">Eliminar</button>
      </li>)}</ul>}
    {deleting && <Modal labelledBy="delete-brand-title" onClose={() => !busy && setDeleting(null)} title="Eliminar marca">
      <p className="mt-3 text-sm text-body">Se eliminará «{deleting.name}».</p>
      {deleting.productCount > 0 && <p className="mt-3 border-l-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-900">
        Hay {deleting.productCount} producto(s) registrados con esta marca. Permanecerán en el sistema, pero quedarán sin marca.
      </p>}
      <div className="mt-6 flex justify-end gap-3">
        <button className={ui.secondary} disabled={busy} onClick={() => setDeleting(null)} type="button">Cancelar</button>
        <button className={ui.danger} disabled={busy} onClick={() => void remove()} type="button">Sí, eliminar</button>
      </div>
    </Modal>}
  </section>;
}
