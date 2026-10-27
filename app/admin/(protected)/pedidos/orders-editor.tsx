"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Feedback, Pill, formatBOB, formatDate, ui } from "../../admin-ui";
import { orderState, type AdminOrder as Order } from "../dashboard";

const paymentLabel: Record<Order["paymentStatus"], string> = {
  awaiting_receipt: "Sin comprobante", submitted: "Comprobante pendiente de revisión",
  verified: "Abono verificado", rejected: "Comprobante rechazado", not_required: "Sin pago en línea",
};

const filters = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "review", label: "Comprobante por revisar" },
  { value: "verified", label: "Pago verificado" },
  { value: "confirmed", label: "Confirmados" },
  { value: "delivery", label: "Envíos" },
  { value: "cancelled", label: "Cancelados" },
];

function matches(order: Order, filter: string) {
  if (filter === "pending") return order.status === "pending";
  if (filter === "review") return order.status === "pending" && order.paymentStatus === "submitted";
  if (filter === "verified") return order.status === "pending" && order.paymentStatus === "verified";
  if (filter === "confirmed") return order.status === "confirmed";
  if (filter === "delivery") return order.deliveryMethod === "delivery" && order.status !== "cancelled";
  if (filter === "cancelled") return order.status === "cancelled";
  return true;
}

export default function OrdersEditor() {
  const params = useSearchParams();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState(params.get("q") || "");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(0);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/orders", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudieron cargar los pedidos.");
    setOrders((await response.json()) as Order[]);
  }, []);

  useEffect(() => {
    void fetch("/api/admin/orders", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar los pedidos.");
        setOrders((await response.json()) as Order[]);
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : "No se pudieron cargar los pedidos.");
      });
  }, []);

  async function confirm(order: Order) {
    if (busyId !== null) return;
    setBusyId(order.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/confirm`, { method: "POST" });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo confirmar el pedido.");
      await refresh();
      setNotice(`Pedido ${order.number} confirmado. El inventario fue actualizado.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo confirmar el pedido.");
    } finally {
      setBusyId(null);
    }
  }

  async function review(order: Order, decision: "verify" | "reject") {
    if (busyId !== null) return;
    if (decision === "verify" && !window.confirm(`¿Confirmaste en tu banca que ingresó el monto exacto de ${order.number}? El comprobante por sí solo no demuestra el pago.`)) return;
    setBusyId(order.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/payment/${decision}`, { method: "POST" });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo revisar el comprobante.");
      await refresh();
      setNotice(decision === "verify" ? `Pago de ${order.number} verificado. Ya puedes confirmar el pedido.` :
        `Comprobante de ${order.number} rechazado. El cliente puede subir otro.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo revisar el comprobante."); }
    finally { setBusyId(null); }
  }

  // Verifying the bank transfer and debiting stock are separate API steps; run them in sequence.
  async function approveAndConfirm(order: Order) {
    if (busyId !== null) return;
    if (!window.confirm(`¿Confirmaste en tu banca que ingresó el monto exacto de ${order.number}? Se aprobará el comprobante y se descontará el stock.`)) return;
    setBusyId(order.id); setError(""); setNotice("");
    try {
      const verified = await fetch(`/api/admin/orders/${order.id}/payment/verify`, { method: "POST" });
      if (!verified.ok) throw new Error((await verified.text()).trim() || "No se pudo verificar el pago.");
      const confirmed = await fetch(`/api/admin/orders/${order.id}/confirm`, { method: "POST" });
      if (!confirmed.ok) {
        const detail = (await confirmed.text()).trim();
        await refresh().catch(() => undefined);
        throw new Error(`El pago quedó verificado, pero el pedido no se confirmó${detail ? `: ${detail}` : ""}. Revisa el inventario y pulsa «Confirmar y descontar inventario».`);
      }
      await refresh();
      setNotice(`Pago de ${order.number} aprobado y pedido confirmado. El inventario fue actualizado.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo aprobar el pago."); }
    finally { setBusyId(null); }
  }

  async function cancel(order: Order) {
    if (busyId !== null) return;
    if (!window.confirm(`¿Cancelar el pedido ${order.number}? No se descuenta inventario y el cliente verá el pedido como cancelado.`)) return;
    setBusyId(order.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error((await response.text()).trim() || "No se pudo cancelar el pedido.");
      await refresh();
      setNotice(`Pedido ${order.number} cancelado.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo cancelar el pedido."); }
    finally { setBusyId(null); }
  }

  const visible = useMemo(() => {
    const text = query.trim().toLocaleUpperCase("es-BO").replace(/\s+/g, "");
    return (orders || []).filter((order) => matches(order, filter) && (!text ||
      `${order.number}${order.customerName}${order.customerPhone}${order.pickupBranchName}`.toLocaleUpperCase("es-BO").replace(/\s+/g, "").includes(text)));
  }, [orders, filter, query]);
  const selected = visible.find((order) => order.id === selectedId) || visible[0];

  return <div className="flex flex-col gap-5">
    <Feedback error={error} notice={notice} />
    <div className="flex flex-wrap items-center gap-3 bg-white p-4">
      <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 border border-line px-3 focus-within:border-ink sm:max-w-sm">
        <svg aria-hidden="true" className="size-4 text-graphite" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span className="sr-only">Buscar pedidos</span>
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)}
          placeholder="Número, cliente, teléfono o sucursal" type="search" value={query} />
      </label>
      <div aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5" role="group">
        {filters.map((item) => {
          const count = (orders || []).filter((order) => matches(order, item.value)).length;
          return <button aria-pressed={filter === item.value} className={ui.chip(filter === item.value)} key={item.value}
            onClick={() => setFilter(item.value)} type="button">{item.label}<span className="font-mono text-[11px] opacity-70">{count}</span></button>;
        })}
      </div>
    </div>

    {orders === null ? <p className="text-sm text-graphite">Cargando pedidos…</p> : orders.length === 0 ?
      <EmptyState>Aún no hay pedidos registrados.</EmptyState> : visible.length === 0 ?
      <EmptyState>No hay pedidos que coincidan con la búsqueda o el filtro.</EmptyState> :
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ul className="m-0 flex list-none flex-col gap-px bg-line p-0">
          {visible.map((order) => {
            const state = orderState(order);
            const active = order.id === selected?.id;
            return <li key={order.id}>
              <button aria-pressed={active} className={`grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 p-4 text-left sm:px-5 ${active ? "bg-white shadow-[inset_3px_0_0_#141414]" : "bg-white/70 hover:bg-white"}`}
                onClick={() => setSelectedId(order.id)} type="button">
                <span className="font-mono text-[13px]">{order.number}</span>
                <span className="text-right font-mono text-sm">{formatBOB(order.totalMinor)}</span>
                <span className="text-sm font-medium">{order.customerName} <span className="font-normal text-graphite">· {order.pickupBranchName}</span></span>
                <span className="text-right"><Pill tone={state.tone}>{state.label}</Pill></span>
                <span className="text-xs text-graphite">{formatDate(order.createdAt)} · {order.deliveryMethod === "delivery" ? "Envío" : "Recojo"} · {order.paymentMethod === "qr" ? "QR" : "WhatsApp"} · {order.items.reduce((sum, item) => sum + item.quantity, 0)} u.</span>
              </button>
            </li>;
          })}
        </ul>

        {selected && <article className="flex flex-col gap-5 bg-white p-5 sm:p-6 xl:sticky xl:top-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className={ui.eyebrow}>Pedido</span>
              <h2 className="xp-display m-0 text-2xl">{selected.number}</h2>
              <span className="text-xs text-graphite">Registrado el {new Date(selected.createdAt).toLocaleString("es-BO")}</span>
            </div>
            <Pill tone={orderState(selected).tone}>{orderState(selected).label}</Pill>
          </div>
          <dl className="m-0 grid gap-x-6 gap-y-3 border-y border-line py-4 text-sm sm:grid-cols-2">
            <div><dt className={ui.eyebrow}>Cliente</dt><dd className="m-0 mt-1">{selected.customerName}</dd>
              <dd className="m-0 font-mono text-[13px]"><a className="hover:underline" href={`tel:${selected.customerPhone.replace(/[^+\d]/g, "")}`}>{selected.customerPhone}</a></dd></div>
            <div><dt className={ui.eyebrow}>Entrega</dt>
              {selected.deliveryMethod === "delivery" ? <>
                <dd className="m-0 mt-1">Envío a domicilio</dd>
                <dd className="m-0 text-graphite">Dirección y costo por WhatsApp · despacha {selected.pickupBranchName}</dd>
              </> : <>
                <dd className="m-0 mt-1">Recojo en {selected.pickupBranchName}</dd>
                {selected.pickupAddress && <dd className="m-0 text-graphite">{selected.pickupAddress}</dd>}
              </>}</div>
            <div><dt className={ui.eyebrow}>Pago</dt><dd className="m-0 mt-1">{selected.paymentMethod === "qr" ? "Transferencia por QR" : "Coordinación por WhatsApp"}</dd>
              {selected.paymentMethod === "qr" && <dd className="m-0 text-graphite">{paymentLabel[selected.paymentStatus]}</dd>}</div>
            {selected.customerNote && <div className="sm:col-span-2"><dt className={ui.eyebrow}>Nota del cliente</dt>
              <dd className="m-0 mt-1 whitespace-pre-line">{selected.customerNote}</dd></div>}
          </dl>
          <table className="w-full border-collapse text-sm">
            <thead><tr><th className="pb-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-graphite">Producto</th>
              <th className="pb-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-graphite">Importe</th></tr></thead>
            <tbody>{selected.items.map((item, index) => <tr className="border-t border-mist" key={index}>
              <td className="py-2.5 pr-3">{item.quantity} × {item.productName}<span className="block text-xs text-graphite">{item.variantLabel} · {formatBOB(item.unitPriceMinor)} c/u</span></td>
              <td className="py-2.5 text-right font-mono">{formatBOB(item.lineTotalMinor)}</td>
            </tr>)}</tbody>
            <tfoot><tr className="border-t border-ink"><td className="pt-3 font-semibold">Total</td><td className="pt-3 text-right font-mono text-lg">{formatBOB(selected.totalMinor)}</td></tr></tfoot>
          </table>

          {selected.hasReceipt && <a className={`${ui.secondary} self-start`} href={`/api/admin/orders/${selected.id}/receipt`}>Descargar último comprobante</a>}
          {selected.paymentStatus === "submitted" && <div className="flex flex-col gap-3 bg-soft p-4">
            <p className="m-0 text-xs leading-relaxed text-body">La imagen del comprobante no prueba el abono. Comprueba monto, cuenta y movimiento real en tu banca antes de verificar.</p>
            <button className={`${ui.primary} h-12`} disabled={busyId !== null} onClick={() => void approveAndConfirm(selected)} type="button">
              {busyId === selected.id ? "Procesando…" : "Aprobar pago y descontar stock"}</button>
            <div className="flex flex-wrap gap-2">
              <button className={ui.secondary} disabled={busyId !== null} onClick={() => void review(selected, "verify")} type="button">Solo verificar el pago</button>
              <button className={ui.secondary} disabled={busyId !== null} onClick={() => void review(selected, "reject")} type="button">Rechazar comprobante</button>
            </div>
          </div>}
          {selected.status === "pending" && selected.paymentStatus !== "submitted" && <div className="flex flex-col gap-2">
            <button className={`${ui.primary} h-12`} disabled={busyId !== null || (selected.paymentMethod === "qr" && selected.paymentStatus !== "verified")}
              onClick={() => void confirm(selected)} type="button">{busyId === selected.id ? "Confirmando…" : "Confirmar y descontar inventario"}</button>
            {selected.paymentMethod === "qr" && selected.paymentStatus !== "verified" &&
              <span className="text-xs text-graphite">Un pedido con QR se confirma después de verificar el abono.</span>}
          </div>}
          {selected.status === "pending" && selected.paymentStatus !== "verified" &&
            <button className={`${ui.dangerLink} self-start`} disabled={busyId !== null} onClick={() => void cancel(selected)} type="button">Cancelar pedido</button>}
          {selected.cancelledAt && <span className="text-xs text-graphite">Cancelado el {new Date(selected.cancelledAt).toLocaleString("es-BO")}. No se descontó inventario.</span>}
          {selected.confirmedAt && <span className="text-xs text-graphite">Confirmado el {new Date(selected.confirmedAt).toLocaleString("es-BO")}. Sus unidades ya se descontaron del inventario.</span>}
        </article>}
      </div>}
  </div>;
}
