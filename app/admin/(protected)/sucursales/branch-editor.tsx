"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, Feedback, ui } from "../../admin-ui";

type Branch = { id: number; code: string; name: string; address: string; instructions: string };

export default function BranchEditor() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [selectedId, setSelectedId] = useState(0);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function select(branch: Branch) {
    setSelectedId(branch.id);
    setName(branch.name);
    setAddress(branch.address);
    setInstructions(branch.instructions);
  }

  useEffect(() => {
    void fetch("/api/admin/branches", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar las sucursales.");
        const items = (await response.json()) as Branch[];
        setBranches(items);
        if (items[0]) select(items[0]);
      })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "No se pudieron cargar las sucursales."));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selectedId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/branches/${selectedId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, instructions }),
      });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo guardar la sucursal.");
      const saved = (await response.json()) as Branch;
      setBranches((current) => current?.map((branch) => branch.id === saved.id ? saved : branch) || []);
      select(saved);
      setNotice("Sucursal actualizada. Los nuevos pedidos mostrarán estos datos; los anteriores conservan su copia histórica.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar la sucursal.");
    } finally { setBusy(false); }
  }

  const selected = branches?.find((branch) => branch.id === selectedId);
  return <div className="flex flex-col gap-5">
    <Feedback error={error} notice={notice} />
    {!branches ? <p className="text-sm text-graphite">Cargando…</p> : branches.length === 0 ?
      <EmptyState>No hay sucursales activas.</EmptyState> :
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ul className="m-0 flex list-none flex-col gap-px bg-line p-0">
          {branches.map((branch) => <li key={branch.id}>
            <button aria-pressed={branch.id === selectedId} className={`flex w-full flex-col gap-1 p-4 text-left ${branch.id === selectedId ? "bg-white shadow-[inset_3px_0_0_#141414]" : "bg-white/70 hover:bg-white"}`}
              disabled={busy} onClick={() => select(branch)} type="button">
              <span className="text-sm font-semibold">{branch.name}</span>
              <span className="font-mono text-[11px] text-graphite">{branch.code}</span>
              {branch.address && <span className="text-xs text-graphite">{branch.address}</span>}
            </button>
          </li>)}
        </ul>
        <form className={`${ui.card} ${ui.cardPad} flex flex-col gap-4`} onSubmit={(event) => void save(event)}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={ui.cardTitle}>Datos visibles para el cliente</h2>
            <span className="font-mono text-xs text-graphite">Código interno: {selected?.code}</span>
          </div>
          <label className={ui.label}>Nombre *
            <input className={ui.input} disabled={busy} maxLength={120}
              onChange={(event) => setName(event.target.value.toLocaleUpperCase("es-BO"))} required value={name} />
          </label>
          <label className={ui.label}>Dirección para recojo
            <textarea className={ui.textarea} disabled={busy} maxLength={300}
              onChange={(event) => setAddress(event.target.value)} rows={2} value={address} />
          </label>
          <label className={ui.label}>Indicaciones de recojo
            <textarea className={ui.textarea} disabled={busy} maxLength={500}
              onChange={(event) => setInstructions(event.target.value)} rows={3} value={instructions} />
            <span className={ui.hint}>Se muestran al elegir la sucursal en el carrito. Los pedidos anteriores conservan los datos con los que se registraron.</span>
          </label>
          <button className={`${ui.primary} self-start`} disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar sucursal"}</button>
        </form>
      </div>}
  </div>;
}
