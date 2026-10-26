"use client";

import { useEffect, useState, type FormEvent } from "react";

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

  return <div className="space-y-6">
    {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
    <form className="rounded-xl border border-zinc-200 bg-white p-6" onSubmit={(event) => void save(event)}>
      <h2 className="text-lg font-semibold">{editing ? "Modificar marca" : "Agregar marca"}</h2>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 text-sm">Nombre *
          <input className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2" disabled={busy}
            maxLength={120} onChange={(event) => setName(event.target.value.toLocaleUpperCase("es-BO"))}
            required value={name} />
        </label>
        <button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy} type="submit">{editing ? "Guardar cambios" : "Agregar"}</button>
        {editing && <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" disabled={busy}
          onClick={() => { setEditing(null); setName(""); }} type="button">Cancelar</button>}
      </div>
    </form>
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Marcas registradas</h2>
      {brands.length === 0 ? <p className="mt-3 text-sm text-zinc-600">Aún no hay marcas.</p> :
        <ul className="mt-4 divide-y divide-zinc-100">{brands.map((brand) => <li className="flex flex-wrap items-center gap-3 py-3" key={brand.id}>
          <span className="mr-auto font-medium">{brand.name} <span className="text-sm font-normal text-zinc-500">· {brand.productCount} producto(s)</span></span>
          <button className="text-sm text-blue-800 underline" disabled={busy} onClick={() => {
            setEditing(brand); setName(brand.name); setError("");
          }} type="button">Modificar</button>
          <button className="text-sm text-red-700 underline" disabled={busy}
            onClick={() => setDeleting(brand)} type="button">Eliminar</button>
        </li>)}</ul>}
    </section>
    {deleting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
      <div aria-labelledby="delete-brand-title" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog">
        <h2 className="text-xl font-semibold" id="delete-brand-title">Eliminar marca</h2>
        <p className="mt-3 text-sm text-zinc-700">Se eliminará «{deleting.name}».</p>
        {deleting.productCount > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Hay {deleting.productCount} producto(s) registrados con esta marca. Permanecerán en el sistema, pero quedarán sin marca.
        </p>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" disabled={busy}
            onClick={() => setDeleting(null)} type="button">Cancelar</button>
          <button className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={busy} onClick={() => void remove()} type="button">Sí, eliminar</button>
        </div>
      </div>
    </div>}
  </div>;
}
