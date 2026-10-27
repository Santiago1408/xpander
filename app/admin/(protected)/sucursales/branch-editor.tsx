"use client";

import { useEffect, useState, type FormEvent } from "react";

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

  return <div className="space-y-5">
    {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
    {!branches ? <p>Cargando…</p> : branches.length === 0 ?
      <p className="rounded-xl border border-dashed border-zinc-300 p-6">No hay sucursales activas.</p> :
      <form className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6" onSubmit={(event) => void save(event)}>
        {branches.length > 1 && <label className="block text-sm">Sucursal *
          <select className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" disabled={busy}
            onChange={(event) => { const branch = branches.find((item) => item.id === Number(event.target.value)); if (branch) select(branch); }} value={selectedId}>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>}
        <p className="text-xs text-zinc-500">Código interno: {branches.find((branch) => branch.id === selectedId)?.code}</p>
        <label className="block text-sm">Nombre *
          <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" disabled={busy} maxLength={120}
            onChange={(event) => setName(event.target.value.toLocaleUpperCase("es-BO"))} required value={name} />
        </label>
        <label className="block text-sm">Dirección para recojo (opcional)
          <textarea className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" disabled={busy} maxLength={300}
            onChange={(event) => setAddress(event.target.value)} rows={2} value={address} />
        </label>
        <label className="block text-sm">Indicaciones de recojo (opcional)
          <textarea className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" disabled={busy} maxLength={500}
            onChange={(event) => setInstructions(event.target.value)} rows={3} value={instructions} />
        </label>
        <button className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar sucursal"}</button>
      </form>}
  </div>;
}
