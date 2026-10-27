"use client";

import { useEffect, useState, type FormEvent } from "react";

type Kind = "style" | "audience";
type Term = { id: number; kind: Kind; name: string; productCount: number };

const kinds: { value: Kind; title: string; example: string }[] = [
  { value: "style", title: "Estilos de ropa", example: "CASUAL, DEPORTIVA, ELEGANTE…" },
  { value: "audience", title: "Público", example: "MUJERES, HOMBRES, NIÑOS…" },
];

export default function TermEditor() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [kind, setKind] = useState<Kind>("style");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Term | null>(null);
  const [deleting, setDeleting] = useState<Term | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/catalog/terms", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudieron cargar los estilos y públicos.");
    setTerms((await response.json()) as Term[]);
  }

  useEffect(() => {
    void fetch("/api/admin/catalog/terms", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar los estilos y públicos.");
        setTerms((await response.json()) as Term[]);
      })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "No se pudieron cargar los elementos."));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(editing ? `/api/admin/catalog/terms/${editing.id}` : "/api/admin/catalog/terms", {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { name } : { kind, name }),
      });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo guardar el elemento.");
      await refresh();
      setEditing(null); setName(""); setNotice("Elemento guardado.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar el elemento.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/catalog/terms/${deleting.id}?confirm=1&expectedCount=${deleting.productCount}`, { method: "DELETE" });
      if (response.status === 409) {
        const detail = (await response.json()) as { productCount: number };
        setDeleting({ ...deleting, productCount: detail.productCount });
        throw new Error("Cambió el número de productos. Revisa la advertencia y confirma de nuevo.");
      }
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo eliminar el elemento.");
      await refresh();
      if (editing?.id === deleting.id) { setEditing(null); setName(""); }
      setDeleting(null); setNotice("Elemento eliminado. Los productos asociados quedaron sin ese dato.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo eliminar el elemento.");
    } finally { setBusy(false); }
  }

  return <div className="space-y-6">
    {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
    <form className="rounded-xl border border-zinc-200 bg-white p-6" onSubmit={(event) => void save(event)}>
      <h2 className="text-lg font-semibold">{editing ? "Modificar elemento" : "Agregar elemento"}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <label className="text-sm">Tipo *
          <select className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" disabled={busy || !!editing}
            onChange={(event) => setKind(event.target.value as Kind)} value={kind}>
            {kinds.map((item) => <option key={item.value} value={item.value}>{item.title}</option>)}
          </select>
        </label>
        <label className="text-sm">Nombre *
          <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" disabled={busy}
            maxLength={120} onChange={(event) => setName(event.target.value.toLocaleUpperCase("es-BO"))}
            placeholder={kinds.find((item) => item.value === kind)?.example} required value={name} />
        </label>
        <button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy} type="submit">Guardar</button>
      </div>
      {editing && <button className="mt-3 text-sm underline" disabled={busy} onClick={() => { setEditing(null); setName(""); }} type="button">Cancelar edición</button>}
    </form>
    {kinds.map((group) => <section className="rounded-xl border border-zinc-200 bg-white p-6" key={group.value}>
      <h2 className="text-lg font-semibold">{group.title}</h2>
      {terms.filter((term) => term.kind === group.value).length === 0 ?
        <p className="mt-3 text-sm text-zinc-600">Aún no hay elementos.</p> :
        <ul className="mt-3 divide-y divide-zinc-100">
          {terms.filter((term) => term.kind === group.value).map((term) => <li className="flex flex-wrap items-center gap-3 py-3" key={term.id}>
            <span className="mr-auto font-medium">{term.name} <span className="text-sm font-normal text-zinc-500">· {term.productCount} producto(s)</span></span>
            <button className="text-sm text-blue-800 underline" disabled={busy} onClick={() => {
              setEditing(term); setKind(term.kind); setName(term.name); setError("");
            }} type="button">Modificar</button>
            <button className="text-sm text-red-700 underline" disabled={busy} onClick={() => setDeleting(term)} type="button">Eliminar</button>
          </li>)}
        </ul>}
    </section>)}
    {deleting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
      <div aria-labelledby="delete-term-title" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog">
        <h2 className="text-xl font-semibold" id="delete-term-title">Eliminar elemento</h2>
        <p className="mt-3 text-sm">Se eliminará «{deleting.name}».</p>
        {deleting.productCount > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Hay {deleting.productCount} producto(s) asociados. Permanecerán registrados, pero perderán este dato.
        </p>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-lg border px-4 py-2 text-sm" disabled={busy} onClick={() => setDeleting(null)} type="button">Cancelar</button>
          <button className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy}
            onClick={() => void remove()} type="button">Sí, eliminar</button>
        </div>
      </div>
    </div>}
  </div>;
}
