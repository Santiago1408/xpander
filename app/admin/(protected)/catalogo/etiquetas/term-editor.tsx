"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Feedback, IconButton, Modal, ui } from "../../../admin-ui";

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

  return <div className="flex flex-col gap-4">
    <form className={`${ui.card} ${ui.cardPad} flex flex-col gap-3`} onSubmit={(event) => void save(event)}>
      <h2 className={ui.cardTitle}>{editing ? `Modificar «${editing.name}»` : "Nuevo estilo o público"}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
        <label className={ui.label}>Tipo *
          <select className={ui.input} disabled={busy || !!editing} onChange={(event) => setKind(event.target.value as Kind)} value={kind}>
            {kinds.map((item) => <option key={item.value} value={item.value}>{item.title}</option>)}
          </select>
        </label>
        <label className={ui.label}>Nombre *
          <input className={ui.input} disabled={busy} maxLength={120} onChange={(event) => setName(event.target.value.toLocaleUpperCase("es-BO"))}
            placeholder={kinds.find((item) => item.value === kind)?.example} required value={name} />
        </label>
        <button className={ui.primary} disabled={busy} type="submit">Guardar</button>
      </div>
      {editing && <button className={`${ui.link} self-start`} disabled={busy} onClick={() => { setEditing(null); setName(""); }} type="button">Cancelar edición</button>}
      <Feedback error={error} notice={notice} />
    </form>
    <div className="grid items-start gap-4 md:grid-cols-2">
      {kinds.map((group) => {
        const items = terms.filter((term) => term.kind === group.value);
        return <section className={ui.card} key={group.value}>
          <div className="flex items-baseline justify-between border-b border-line px-5 py-4 sm:px-6">
            <h2 className={ui.cardTitle}>{group.title}</h2><span className="font-mono text-xs text-graphite">{items.length}</span>
          </div>
          {items.length === 0 ? <p className="m-0 p-5 text-sm text-graphite sm:px-6">Aún no hay elementos.</p> :
            <ul className="m-0 list-none p-0">{items.map((term) => <li className={`flex items-center gap-3 border-t border-mist px-5 py-3 first:border-0 sm:px-6 ${editing?.id === term.id ? "bg-soft" : ""}`} key={term.id}>
              <span className="mr-auto flex flex-col"><span className="text-sm font-medium">{term.name}</span>
                <span className="font-mono text-[11px] text-graphite">{term.productCount} producto(s)</span></span>
              <IconButton disabled={busy} icon="edit" label={`Editar ${term.name}`} onClick={() => { setEditing(term); setKind(term.kind); setName(term.name); setError(""); }} />
              <IconButton disabled={busy} icon="delete" label={`Eliminar ${term.name}`} onClick={() => setDeleting(term)} tone="danger" />
            </li>)}</ul>}
        </section>;
      })}
    </div>
    {deleting && <Modal labelledBy="delete-term-title" onClose={() => !busy && setDeleting(null)} title="Eliminar elemento">
      <p className="mt-3 text-sm text-body">Se eliminará «{deleting.name}».</p>
      {deleting.productCount > 0 && <p className="mt-3 border-l-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-900">
        Hay {deleting.productCount} producto(s) asociados. Permanecerán registrados, pero perderán este dato.
      </p>}
      <div className="mt-6 flex justify-end gap-3">
        <button className={ui.secondary} disabled={busy} onClick={() => setDeleting(null)} type="button">Cancelar</button>
        <button className={ui.danger} disabled={busy} onClick={() => void remove()} type="button">Sí, eliminar</button>
      </div>
    </Modal>}
  </div>;
}
