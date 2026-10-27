"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card, ChipRow, EmptyState, Feedback, Pill, formatDate, ui } from "../../admin-ui";

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
  const [stockQuery, setStockQuery] = useState("");
  const [stockBranch, setStockBranch] = useState(0);
  const [movementKind, setMovementKind] = useState("all");

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

  const stockRows = (data?.stock || []).filter((item) => (!stockBranch || item.branchId === stockBranch) &&
    (!stockQuery.trim() || item.label.toLocaleUpperCase("es-BO").includes(stockQuery.trim().toLocaleUpperCase("es-BO"))));
  const movements = (data?.movements || []).filter((item) => movementKind === "all" || item.kind === movementKind);
  const totalUnits = (data?.stock || []).reduce((sum, item) => sum + item.quantity, 0);
  const kindLabel: Record<string, string> = { purchase: "Entrada", adjustment: "Ajuste", sale: "Venta" };

  return <div className="flex flex-col gap-5">
    <Feedback error={error} notice={notice} />
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {[["Unidades en stock", String(totalUnits)], ["Variantes con saldo", String(data?.stock.filter((item) => item.quantity > 0).length ?? 0)],
        ["Stock bajo (≤ 3 u.)", String(data?.stock.filter((item) => item.quantity <= 3).length ?? 0)], ["Sucursales activas", String(data?.branches.length ?? 0)]]
        .map(([label, value]) => <div className="flex flex-col gap-3 bg-white p-4 sm:p-5" key={label}>
          <span className="text-[13px] text-graphite">{label}</span><span className="font-mono text-2xl">{data ? value : "—"}</span>
        </div>)}
    </div>
    <div className="grid items-start grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <form className={`${ui.card} ${ui.cardPad} flex flex-col gap-4 xl:sticky xl:top-6`} onSubmit={(event) => void submit(event)}>
        <div>
          <h2 className={ui.cardTitle}>Registrar movimiento</h2>
          <p className={`${ui.hint} mt-1`}>Para una compra elige «Entrada», la variante, la cantidad y el costo unitario. Una corrección se registra como ajuste con motivo.</p>
        </div>
        <div aria-label="Tipo de movimiento" className="grid grid-cols-2 border border-ink" role="radiogroup">
          {([["purchase", "Entrada"], ["adjustment", "Ajuste"]] as const).map(([value, label]) =>
            <button aria-checked={kind === value} className={`h-10 text-[13px] font-semibold ${kind === value ? "bg-ink text-white" : "bg-white hover:bg-soft"}`}
              disabled={busy} key={value} onClick={() => { setKind(value); setDelta(""); }} role="radio" type="button">{label}</button>)}
        </div>
        <label className={ui.label}>Sucursal *
          <select className={ui.input} disabled={busy} required onChange={(event) => setBranchId(Number(event.target.value))} value={branchId}>
            <option disabled value={0}>Selecciona la sucursal</option>
            {data?.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className={ui.label}>Variante *
          <select className={ui.input} disabled={busy} required onChange={(event) => setVariantId(Number(event.target.value))} value={variantId}>
            <option disabled value={0}>Selecciona una variante</option>
            {data?.variants.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={ui.label}>{kind === "purchase" ? "Unidades *" : "Variación (+/−) *"}
            <input className={`${ui.input} font-mono`} disabled={busy} max={1000000} min={kind === "purchase" ? 1 : -1000000}
              onChange={(event) => setDelta(event.target.value)} required step={1} type="number" value={delta} />
          </label>
          {kind === "purchase" && <label className={ui.label}>Costo/u. (Bs) *
            <input className={`${ui.input} font-mono`} disabled={busy} inputMode="decimal" onChange={(event) => setCost(event.target.value)}
              placeholder="60.00" required value={cost} />
          </label>}
        </div>
        <label className={ui.label}>{kind === "adjustment" ? "Motivo *" : "Nota (opcional)"}
          <input className={ui.input} disabled={busy} maxLength={500} onChange={(event) => setNote(event.target.value)} required={kind === "adjustment"} value={note} />
        </label>
        <button className={`${ui.primary} h-12`} disabled={busy || !data?.variants.length || !data.branches.length} type="submit">{busy ? "Registrando…" : "Registrar movimiento"}</button>
        {data && !data.variants.length && <p className={ui.hint}>Primero crea una ficha y una variante en <Link className="underline" href="/admin/catalogo/productos">Productos</Link>.</p>}
      </form>

      <div className="flex min-w-0 flex-col gap-4">
        <Card padded={false} title="Existencias por sucursal" actions={<>
          <input aria-label="Buscar en existencias" className={`${ui.input} h-10 w-full sm:h-9 sm:w-48`} onChange={(event) => setStockQuery(event.target.value)} placeholder="Buscar producto o código" type="search" value={stockQuery} />
          {(data?.branches.length || 0) > 1 && <select aria-label="Filtrar por sucursal" className={`${ui.input} h-10 w-full sm:h-9 sm:w-auto`} onChange={(event) => setStockBranch(Number(event.target.value))} value={stockBranch}>
            <option value={0}>Todas las sucursales</option>
            {data?.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>}
        </>}>
          {!data ? <p className="p-6 text-sm text-graphite">Cargando…</p> : data.stock.length === 0 ? <div className="p-6"><EmptyState>Aún no hay existencias registradas.</EmptyState></div> :
            stockRows.length === 0 ? <p className="p-6 text-sm text-graphite">Sin coincidencias.</p> :
            <div className="max-h-[480px] overflow-auto"><table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-white"><tr><th className={ui.th}>Sucursal · producto · código · talla</th><th className={`${ui.th} text-right`}>Unidades</th></tr></thead>
              <tbody>{stockRows.map((item) => <tr className="hover:bg-soft" key={`${item.branchId}-${item.variantId}`}>
                <td className={ui.td}>{item.label}</td>
                <td className={`${ui.td} text-right font-mono`}>{item.quantity <= 3 ? <Pill tone={item.quantity === 0 ? "danger" : "dashed"}>{item.quantity} u.</Pill> : item.quantity}</td>
              </tr>)}</tbody>
            </table></div>}
        </Card>
        <Card padded={false} title="Últimos movimientos" description="Los 100 más recientes. Cada fila es inmutable." actions={
          <ChipRow label="Filtrar movimientos">
            {[["all", "Todos"], ["purchase", "Entradas"], ["adjustment", "Ajustes"], ["sale", "Ventas"]].map(([value, label]) =>
              <button aria-pressed={movementKind === value} className={`${ui.chip(movementKind === value)} shrink-0`} key={value} onClick={() => setMovementKind(value)} type="button">{label}</button>)}
          </ChipRow>}>
          {!data ? <p className="p-6 text-sm text-graphite">Cargando…</p> : movements.length === 0 ? <p className="p-6 text-sm text-graphite">Todavía no hay movimientos.</p> :
            <><ul className="m-0 list-none p-0 md:hidden">{movements.map((item) => <li className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-mist px-5 py-3.5 first:border-0" key={item.id}>
              <span className="text-sm">{item.variantLabel}</span>
              <span className={`text-right font-mono text-sm ${item.delta < 0 ? "" : "font-semibold"}`}>{item.delta > 0 ? "+" : ""}{item.delta}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-graphite">
                <Pill tone={item.kind === "purchase" ? "outline" : item.kind === "sale" ? "solid" : "dashed"}>{kindLabel[item.kind] || item.kind}</Pill>
                {item.branchName} · {formatDate(item.createdAt)}{item.recordedBy && ` · ${item.recordedBy}`}
              </span>
              <span className="text-right font-mono text-xs text-graphite">{item.unitCostMinor === null ? "" : `Bs ${formatBOB(item.unitCostMinor)}/u.`}</span>
              {item.note && <span className="col-span-2 text-xs text-graphite">{item.note}</span>}
            </li>)}</ul>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] border-collapse text-sm">
              <thead><tr><th className={ui.th}>Fecha</th><th className={ui.th}>Sucursal y variante</th><th className={ui.th}>Tipo</th>
                <th className={`${ui.th} text-right`}>Unidades</th><th className={`${ui.th} text-right`}>Costo/u.</th><th className={ui.th}>Responsable</th></tr></thead>
              <tbody>{movements.map((item) => <tr className="hover:bg-soft" key={item.id}>
                <td className={`${ui.td} whitespace-nowrap font-mono text-xs`}>{formatDate(item.createdAt)}</td>
                <td className={ui.td}>{item.branchName} · {item.variantLabel}{item.note && <span className="block text-xs text-graphite">{item.note}</span>}</td>
                <td className={ui.td}><Pill tone={item.kind === "purchase" ? "outline" : item.kind === "sale" ? "solid" : "dashed"}>{kindLabel[item.kind] || item.kind}</Pill></td>
                <td className={`${ui.td} text-right font-mono`}>{item.delta > 0 ? "+" : ""}{item.delta}</td>
                <td className={`${ui.td} text-right font-mono`}>{item.unitCostMinor === null ? "—" : `Bs ${formatBOB(item.unitCostMinor)}`}</td>
                <td className={`${ui.td} text-graphite`}>{item.recordedBy || "—"}</td>
              </tr>)}</tbody>
            </table></div></>}
        </Card>
      </div>
    </div>
  </div>;
}
