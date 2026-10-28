"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChipRow, ConfirmDialog, EmptyState, Feedback, MobileSheet, Pill, formatBOB, formatDate, ui } from "../../admin-ui";
import { deliveryLabel, orderState, paymentMethodLabel, type AdminOrder as Order } from "../dashboard";
import { whatsappHref } from "../../../shop-format";

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
  { value: "store", label: "Ventas en tienda" },
  { value: "cancelled", label: "Cancelados" },
];

function matches(order: Order, filter: string) {
  if (filter === "pending") return order.status === "pending";
  if (filter === "review") return order.status === "pending" && order.paymentStatus === "submitted";
  if (filter === "verified") return order.status === "pending" && order.paymentStatus === "verified";
  if (filter === "confirmed") return order.status === "confirmed";
  if (filter === "delivery") return order.deliveryMethod === "delivery" && order.status !== "cancelled";
  if (filter === "cancelled") return order.status === "cancelled";
  if (filter === "store") return order.channel === "store";
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialog, setDialog] = useState<{ kind: "confirm" | "approve" | "verify" | "reject" | "cancel"; order: Order } | null>(null);
  const [refundAcknowledged, setRefundAcknowledged] = useState(false);

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

  async function run(order: Order, steps: { path: string; fallback: string }[], success: string) {
    setBusyId(order.id); setError(""); setNotice("");
    try {
      for (const [index, step] of steps.entries()) {
        const response = await fetch(step.path, { method: "POST" });
        if (!response.ok) {
          const detail = (await response.text()).trim() || step.fallback;
          if (index > 0) await refresh().catch(() => undefined);
          throw new Error(index > 0 ? `El pago quedó verificado, pero el pedido no se confirmó: ${detail}` : detail);
        }
      }
      await refresh();
      setNotice(success);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : steps[0].fallback);
    } finally {
      setBusyId(null); setDialog(null); setRefundAcknowledged(false);
    }
  }

  function perform() {
    if (!dialog || busyId !== null) return;
    const { kind, order } = dialog;
    const base = `/api/admin/orders/${order.id}`;
    if (kind === "confirm") void run(order, [{ path: `${base}/confirm`, fallback: "No se pudo confirmar el pedido." }],
      `Pedido ${order.number} confirmado. El inventario fue actualizado.`);
    // Verifying the transfer and debiting stock are separate API steps; they run in sequence.
    if (kind === "approve") void run(order, [{ path: `${base}/payment/verify`, fallback: "No se pudo verificar el pago." },
      { path: `${base}/confirm`, fallback: "No se pudo confirmar el pedido." }],
      `Pago de ${order.number} aprobado y pedido confirmado. El inventario fue actualizado.`);
    if (kind === "verify") void run(order, [{ path: `${base}/payment/verify`, fallback: "No se pudo verificar el pago." }],
      `Pago de ${order.number} verificado. Ya puedes confirmar el pedido.`);
    if (kind === "reject") void run(order, [{ path: `${base}/payment/reject`, fallback: "No se pudo rechazar el comprobante." }],
      `Comprobante de ${order.number} rechazado. El cliente puede subir otro.`);
    if (kind === "cancel") void run(order, [{ path: `${base}/cancel${order.paymentStatus === "verified" ? "?refundAcknowledged=1" : ""}`,
      fallback: "No se pudo cancelar el pedido." }], `Pedido ${order.number} cancelado.`);
  }

  const visible = useMemo(() => {
    const text = query.trim().toLocaleUpperCase("es-BO").replace(/\s+/g, "");
    return (orders || []).filter((order) => matches(order, filter) && (!text ||
      `${order.number}${order.customerName}${order.customerPhone}${order.pickupBranchName}`.toLocaleUpperCase("es-BO").replace(/\s+/g, "").includes(text)));
  }, [orders, filter, query]);
  const selected = visible.find((order) => order.id === selectedId) || visible[0];
  const units = (order: Order) => order.items.reduce((sum, item) => sum + item.quantity, 0);

  function detail(order: Order) {
    const state = orderState(order);
    const pending = order.status === "pending";
    return <article className="flex flex-col gap-5 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className={ui.eyebrow}>Pedido</span>
          <h2 className="xp-display m-0 text-2xl">{order.number}</h2>
          <span className="text-xs text-graphite">Registrado el {new Date(order.createdAt).toLocaleString("es-BO")}</span>
        </div>
        <Pill tone={state.tone}>{state.label}</Pill>
      </div>

      {pending && order.paymentStatus === "submitted" && <div className="flex flex-col gap-3 border border-ink p-4">
        <p className="m-0 text-sm font-semibold">Comprobante por revisar</p>
        <p className="m-0 text-xs leading-relaxed text-body">La imagen del comprobante no prueba el abono. Comprueba monto, cuenta y movimiento real en tu banca antes de aprobar.</p>
        {order.hasReceipt && <a className={`${ui.secondary} w-full sm:w-auto sm:self-start`} href={`/api/admin/orders/${order.id}/receipt`}>Descargar comprobante</a>}
        <button className={`${ui.primary} h-12 w-full`} disabled={busyId !== null} onClick={() => setDialog({ kind: "approve", order })} type="button">Aprobar pago y descontar stock</button>
        <div className="grid grid-cols-2 gap-2">
          <button className={ui.quiet} disabled={busyId !== null} onClick={() => setDialog({ kind: "verify", order })} type="button">Solo verificar</button>
          <button className={ui.quiet} disabled={busyId !== null} onClick={() => setDialog({ kind: "reject", order })} type="button">Rechazar</button>
        </div>
      </div>}
      {pending && order.paymentStatus !== "submitted" && <div className="flex flex-col gap-2">
        <button className={`${ui.primary} h-12 w-full`} disabled={busyId !== null || (order.paymentMethod === "qr" && order.paymentStatus !== "verified")}
          onClick={() => setDialog({ kind: "confirm", order })} type="button">Confirmar y descontar inventario</button>
        {order.paymentMethod === "qr" && order.paymentStatus !== "verified" &&
          <span className="text-xs text-graphite">{order.paymentStatus === "rejected" ? "El comprobante fue rechazado; el cliente puede subir otro." :
            "El cliente aún no subió su comprobante. Un pedido con QR se confirma después de verificar el abono."}</span>}
      </div>}

      <dl className="m-0 grid gap-x-6 gap-y-4 border-y border-line py-4 text-sm sm:grid-cols-2">
        <div><dt className={ui.eyebrow}>Cliente</dt><dd className="m-0 mt-1">{order.customerName}</dd>
          {/\d/.test(order.customerPhone) && <dd className="m-0 mt-0.5 flex flex-wrap gap-x-3 font-mono text-[13px]">
            <a className="underline-offset-4 hover:underline" href={`tel:${order.customerPhone.replace(/[^+\d]/g, "")}`}>{order.customerPhone}</a>
            {whatsappHref(order.customerPhone) && <a className="text-graphite underline-offset-4 hover:underline" href={whatsappHref(order.customerPhone)!} rel="noopener noreferrer" target="_blank">WhatsApp ↗</a>}
          </dd>}</div>
        <div><dt className={ui.eyebrow}>Entrega</dt>
          {order.channel === "store" ? <dd className="m-0 mt-1">Venta en mostrador · {order.pickupBranchName}</dd> : order.deliveryMethod === "delivery" ? <>
            <dd className="m-0 mt-1">Envío a domicilio</dd>
            <dd className="m-0 text-graphite">Dirección y costo por WhatsApp · despacha {order.pickupBranchName}</dd>
          </> : <>
            <dd className="m-0 mt-1">Recojo en {order.pickupBranchName}</dd>
            {order.pickupAddress && <dd className="m-0 text-graphite">{order.pickupAddress}</dd>}
          </>}</div>
        <div><dt className={ui.eyebrow}>Pago</dt><dd className="m-0 mt-1">{order.channel === "store" ? paymentMethodLabel[order.paymentMethod] :
          order.paymentMethod === "qr" ? "Transferencia por QR" : "Coordinado por WhatsApp"}</dd>
          {order.paymentMethod === "qr" && <dd className="m-0 text-graphite">{paymentLabel[order.paymentStatus]}</dd>}
          {order.hasReceipt && order.paymentStatus !== "submitted" && <dd className="m-0 mt-1"><a className={ui.link} href={`/api/admin/orders/${order.id}/receipt`}>Descargar comprobante</a></dd>}</div>
        {order.customerNote && <div className="sm:col-span-2"><dt className={ui.eyebrow}>{order.channel === "store" ? "Nota de la venta" : "Indicaciones del cliente"}</dt>
          <dd className="m-0 mt-1 whitespace-pre-line">{order.customerNote}</dd></div>}
      </dl>
      <table className="w-full border-collapse text-sm">
        <thead><tr><th className="pb-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-graphite">Producto</th>
          <th className="pb-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-graphite">Importe</th></tr></thead>
        <tbody>{order.items.map((item, index) => <tr className="border-t border-mist" key={index}>
          <td className="py-2.5 pr-3">{item.quantity} × {item.productName}<span className="block text-xs text-graphite">{item.variantLabel} · {formatBOB(item.unitPriceMinor)} c/u</span></td>
          <td className="py-2.5 text-right font-mono">{formatBOB(item.lineTotalMinor)}</td>
        </tr>)}</tbody>
        <tfoot>{order.discountMinor > 0 && <tr className="border-t border-ink text-graphite"><td className="pt-3">Descuento</td>
          <td className="pt-3 text-right font-mono">−{formatBOB(order.discountMinor)}</td></tr>}<tr className={order.discountMinor > 0 ? "" : "border-t border-ink"}><td className="pt-3 font-semibold">Total{order.deliveryMethod === "delivery" ? " (sin envío)" : ""}</td>
          <td className="pt-3 text-right font-mono text-lg">{formatBOB(order.totalMinor)}</td></tr></tfoot>
      </table>

      {pending && <button className={`${ui.dangerLink} self-start`} disabled={busyId !== null} onClick={() => setDialog({ kind: "cancel", order })} type="button">Cancelar pedido</button>}
      {order.cancelledAt && <span className="text-xs text-graphite">Cancelado el {new Date(order.cancelledAt).toLocaleString("es-BO")}. No se descontó inventario.</span>}
      {order.confirmedAt && <span className="text-xs text-graphite">Confirmado el {new Date(order.confirmedAt).toLocaleString("es-BO")}. Sus unidades ya se descontaron del inventario.</span>}
    </article>;
  }

  const dialogOrder = dialog?.order;
  const verifiedCancel = dialog?.kind === "cancel" && dialogOrder?.paymentStatus === "verified";

  return <div className="flex flex-col gap-4 sm:gap-5">
    <Feedback error={error} notice={notice} />
    <div className="flex flex-col gap-3 bg-white p-4">
      <label className="flex h-11 items-center gap-2 border border-line px-3 focus-within:border-ink sm:max-w-sm">
        <svg aria-hidden="true" className="size-4 text-graphite" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span className="sr-only">Buscar pedidos</span>
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)}
          placeholder="Número, cliente, teléfono o sucursal" type="search" value={query} />
      </label>
      <ChipRow label="Filtrar por estado">
        {filters.map((item) => {
          const count = (orders || []).filter((order) => matches(order, item.value)).length;
          return <button aria-pressed={filter === item.value} className={`${ui.chip(filter === item.value)} shrink-0`} key={item.value}
            onClick={() => setFilter(item.value)} type="button">{item.label}<span className="font-mono text-[11px] opacity-70">{count}</span></button>;
        })}
      </ChipRow>
    </div>

    {orders === null ? <p className="text-sm text-graphite">Cargando pedidos…</p> : orders.length === 0 ?
      <EmptyState>Aún no hay pedidos registrados.</EmptyState> : visible.length === 0 ?
      <EmptyState>No hay pedidos que coincidan con la búsqueda o el filtro.</EmptyState> :
      <div className="grid items-start grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ul className="m-0 flex list-none flex-col gap-px bg-line p-0">
          {visible.map((order) => {
            const state = orderState(order);
            const active = order.id === selected?.id;
            return <li key={order.id}>
              <button aria-pressed={active} className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 bg-white p-4 text-left sm:px-5 ${active ? "xl:shadow-[inset_3px_0_0_#141414]" : "xl:bg-white/70 xl:hover:bg-white"}`}
                onClick={() => { setSelectedId(order.id); setSheetOpen(true); }} type="button">
                <span className="font-mono text-[13px]">{order.number}</span>
                <span className="text-right font-mono text-sm">{formatBOB(order.totalMinor)}</span>
                <span className="min-w-0 truncate text-sm font-medium">{order.customerName}</span>
                <span className="text-right"><Pill tone={state.tone}>{state.label}</Pill></span>
                <span className="col-span-2 text-xs text-graphite">{formatDate(order.createdAt)} · {deliveryLabel(order)} · {units(order)} u.</span>
              </button>
            </li>;
          })}
        </ul>
        {selected && <div className="hidden xl:sticky xl:top-6 xl:block">{detail(selected)}</div>}
      </div>}

    {sheetOpen && selected && <MobileSheet onClose={() => setSheetOpen(false)} title={`Pedido ${selected.number}`}>{detail(selected)}</MobileSheet>}

    {dialog && dialogOrder && <ConfirmDialog busy={busyId !== null} danger={dialog.kind === "cancel" || dialog.kind === "reject"}
      disabled={verifiedCancel && !refundAcknowledged}
      confirmLabel={{ confirm: "Sí, confirmar y descontar", approve: "Sí, aprobar y descontar", verify: "Sí, verificar el pago",
        reject: "Sí, rechazar comprobante", cancel: "Sí, cancelar pedido" }[dialog.kind]}
      onCancel={() => { setDialog(null); setRefundAcknowledged(false); }} onConfirm={perform}
      title={{ confirm: "Confirmar y descontar inventario", approve: "Aprobar pago y descontar stock", verify: "Verificar el pago",
        reject: "Rechazar comprobante", cancel: "Cancelar pedido" }[dialog.kind]}>
      <div className="flex items-baseline justify-between bg-soft p-3">
        <span><span className="font-mono">{dialogOrder.number}</span> · {dialogOrder.customerName}</span>
        <span className="font-mono">{formatBOB(dialogOrder.totalMinor)}</span>
      </div>
      {(dialog.kind === "confirm" || dialog.kind === "approve") && <>
        <p className="m-0">Se registrará una salida de inventario por cada producto en la sucursal <strong>{dialogOrder.pickupBranchName}</strong> y el pedido pasará a confirmado:</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-xs">
          {dialogOrder.items.map((item, index) => <li className="flex justify-between gap-3" key={index}><span>{item.productName} · {item.variantLabel.split(" · ")[0]}</span><span>−{item.quantity} u.</span></li>)}
        </ul>
        {dialog.kind === "approve" && <p className="m-0 border-l-2 border-amber-600 bg-amber-50 p-3 text-amber-950">Hazlo solo si comprobaste en tu banca que ingresó el monto exacto. El comprobante por sí solo no demuestra el pago.</p>}
        <p className="m-0 text-xs text-graphite">Si el stock no alcanza, no se descuenta nada{dialog.kind === "approve" ? " y el pago quedará verificado" : ""}.</p>
      </>}
      {dialog.kind === "verify" && <p className="m-0">¿Confirmaste en tu banca que ingresó el monto exacto? El pedido seguirá pendiente hasta que lo confirmes y descuentes el inventario.</p>}
      {dialog.kind === "reject" && <p className="m-0">El cliente verá el comprobante como rechazado y podrá subir otro desde su carrito.</p>}
      {dialog.kind === "cancel" && <>
        <p className="m-0">El pedido quedará cancelado y no se descontará inventario. El cliente lo verá como cancelado.</p>
        {verifiedCancel && <>
          <p className="m-0 border-l-2 border-red-700 bg-red-50 p-3 text-red-900">El pago ya está verificado. Solo se puede cancelar si la sucursal no tiene stock suficiente, y deberás devolver el dinero al cliente por tu cuenta.</p>
          <label className="flex items-start gap-2.5"><input checked={refundAcknowledged} className="mt-0.5 size-4 accent-ink" onChange={(event) => setRefundAcknowledged(event.target.checked)} type="checkbox" />
            <span>Devolveré {formatBOB(dialogOrder.totalMinor)} al cliente.</span></label>
        </>}
      </>}
    </ConfirmDialog>}
  </div>;
}
