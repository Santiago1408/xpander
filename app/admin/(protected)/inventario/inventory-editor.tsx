"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Branch = { id: number; name: string };
type Variant = { id: number; label: string };
type Stock = { branchId: number; variantId: number; label: string; quantity: number };
type Movement = {
  id: number; branchName: string; variantLabel: string; kind: string; delta: number;
  unitCostMinor: number | null; note: string; recordedBy: string; createdAt: string;
};
type Inventory = { branches: Branch[]; variants: Variant[]; stock: Stock[]; movements: Movement[] };

function parseBOB(value: string): number | null {
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result <= 1_000_000_000 ? result : null;
}

function formatBOB(minor: number) {
  return new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
}

export default function InventoryEditor() {
  const [data, setData] = useState<Inventory | null>(null);
  const [branchId, setBranchId] = useState(0);
  const [variantId, setVariantId] = useState(0);
  const [kind, setKind] = useState<"purchase" | "adjustment">("purchase");
  const [delta, setDelta] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pendingRequest = useRef<{ key: string; payload: string } | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/inventory", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar el inventario.");
    setData((await response.json()) as Inventory);
  }

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/inventory", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo cargar el inventario.");
        setData((await response.json()) as Inventory);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "No se pudo cargar el inventario.");
      }
    }
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const amount = Number(delta);
    const unitCostMinor = kind === "purchase" ? parseBOB(cost) : null;
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000 ||
      (kind === "purchase" && (amount < 0 || unitCostMinor === null)) ||
      (kind === "adjustment" && !note.trim())) {
      setError("Revisa la cantidad, el costo y el motivo del movimiento.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const requestBody = { branchId, variantId, kind, delta: amount, unitCostMinor, note: note.trim() };
      const payload = JSON.stringify(requestBody);
      if (pendingRequest.current?.payload !== payload) {
        pendingRequest.current = { key: crypto.randomUUID(), payload };
      }
      const response = await fetch("/api/admin/inventory/movements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: pendingRequest.current.key, ...requestBody }),
      });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo registrar el movimiento.");
      await refresh();
      setDelta(""); setCost(""); setNote("");
      pendingRequest.current = null;
      setNotice("Movimiento registrado. El saldo se actualizó en la misma transacción.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo registrar el movimiento.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-7">
    {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
    <form className="rounded-xl border border-zinc-200 bg-white p-6" onSubmit={(event) => void submit(event)}>
      <h2 className="text-xl font-semibold">Registrar movimiento</h2>
      <p className="mt-2 text-sm text-zinc-600">Para cargar el inventario inicial, elige «Entrada», la variante, la cantidad y el costo unitario de compra. Una corrección posterior se registra como ajuste; el historial no se edita.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm">Sucursal *
          <select className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2" disabled={busy} required
            onChange={(event) => setBranchId(Number(event.target.value))} value={branchId}>
            <option disabled value={0}>Selecciona la sucursal</option>
            {data?.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Variante *
          <select className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2" disabled={busy} required
            onChange={(event) => setVariantId(Number(event.target.value))} value={variantId}>
            <option disabled value={0}>Selecciona una variante</option>
            {data?.variants.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-sm">Tipo *
          <select className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2" disabled={busy}
            onChange={(event) => { setKind(event.target.value as "purchase" | "adjustment"); setDelta(""); }} value={kind}>
            <option value="purchase">Entrada de mercancía</option>
            <option value="adjustment">Ajuste de inventario</option>
          </select>
        </label>
        <label className="text-sm">{kind === "purchase" ? "Unidades recibidas *" : "Variación de unidades (+ o −) *"}
          <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" disabled={busy} max={1000000}
            min={kind === "purchase" ? 1 : -1000000} onChange={(event) => setDelta(event.target.value)} required
            step={1} type="number" value={delta} />
        </label>
        {kind === "purchase" && <label className="text-sm">Costo de compra por unidad (Bs) *
          <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" disabled={busy} inputMode="decimal"
            onChange={(event) => setCost(event.target.value)} placeholder="60.00" required value={cost} />
        </label>}
        <label className="text-sm">{kind === "adjustment" ? "Motivo *" : "Nota (opcional)"}
          <input className="mt-1 block w-full rounded-lg border border-zinc-300 p-2" disabled={busy} maxLength={500}
            onChange={(event) => setNote(event.target.value)} required={kind === "adjustment"} value={note} />
        </label>
      </div>
      <button className="mt-5 rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        disabled={busy || !data?.variants.length || !data.branches.length} type="submit">{busy ? "Registrando…" : "Registrar movimiento"}</button>
      {!data?.variants.length && <p className="mt-3 text-sm text-zinc-600">Primero crea una ficha y una variante en <Link className="underline" href="/admin/catalogo/productos">Productos</Link>.</p>}
    </form>
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Existencias por sucursal</h2>
      {!data ? <p className="mt-3">Cargando…</p> : data.stock.length === 0 ? <p className="mt-3 text-sm text-zinc-600">Aún no hay existencias registradas.</p> :
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="py-2">Sucursal · producto · código · talla</th><th className="py-2 text-right">Unidades</th></tr></thead>
          <tbody>{data.stock.map((item) => <tr className="border-b border-zinc-100" key={`${item.branchId}-${item.variantId}`}>
            <td className="py-2">{item.label}</td><td className="py-2 text-right font-medium">{item.quantity}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Últimos movimientos</h2>
      {!data ? <p className="mt-3">Cargando…</p> : data.movements.length === 0 ? <p className="mt-3 text-sm text-zinc-600">Todavía no hay movimientos.</p> :
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="py-2">Fecha</th><th className="py-2">Sucursal y variante</th><th className="py-2">Tipo</th><th className="py-2 text-right">Unidades</th><th className="py-2 text-right">Costo/u.</th><th className="py-2">Responsable</th></tr></thead>
          <tbody>{data.movements.map((item) => <tr className="border-b border-zinc-100" key={item.id}>
            <td className="whitespace-nowrap py-2">{new Date(item.createdAt).toLocaleString("es-BO")}</td>
            <td className="py-2">{item.branchName} · {item.variantLabel}{item.note && <span className="block text-xs text-zinc-500">{item.note}</span>}</td>
            <td className="py-2">{item.kind === "purchase" ? "Entrada" : item.kind === "adjustment" ? "Ajuste" : "Venta"}</td>
            <td className="py-2 text-right">{item.delta > 0 ? "+" : ""}{item.delta}</td>
            <td className="py-2 text-right">{item.unitCostMinor === null ? "—" : `Bs ${formatBOB(item.unitCostMinor)}`}</td>
            <td className="py-2">{item.recordedBy || "—"}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </div>;
}
