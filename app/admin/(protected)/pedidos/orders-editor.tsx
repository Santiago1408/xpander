"use client";

import { useCallback, useEffect, useState } from "react";

type OrderItem = {
  productName: string;
  variantLabel: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
};

type Order = {
  id: number;
  number: string;
  status: string;
  customerName: string;
  customerPhone: string;
  customerNote: string;
  pickupBranchName: string;
  pickupAddress: string;
  totalMinor: number;
  createdAt: string;
  confirmedAt: string | null;
  paymentMethod: "whatsapp" | "qr";
  paymentStatus: "not_required" | "awaiting_receipt" | "submitted" | "verified" | "rejected";
  hasReceipt: boolean;
  items: OrderItem[];
};

function money(minor: number) {
  return `Bs ${new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(minor / 100)}`;
}

export default function OrdersEditor() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  return <div className="space-y-5">
    {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    {notice && <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">{notice}</p>}
    {orders === null ? <p className="text-zinc-600">Cargando pedidos…</p> : orders.length === 0 ?
      <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-zinc-600">Aún no hay pedidos registrados.</p> :
      orders.map((order) => <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm" key={order.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{order.number}</h2>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${order.status === "confirmed" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                {order.status === "confirmed" ? "Confirmado" : order.status === "pending" ? "Pendiente" : order.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">{new Date(order.createdAt).toLocaleString("es-BO")} · {order.pickupBranchName}</p>
            {order.pickupAddress && <p className="text-sm text-zinc-600">{order.pickupAddress}</p>}
          </div>
          <p className="text-lg font-semibold">{money(order.totalMinor)}</p>
        </div>
        <p className="mt-4 text-sm"><span className="font-medium">Cliente:</span> {order.customerName} · {order.customerPhone}</p>
        <p className="mt-2 text-sm"><span className="font-medium">Pago:</span> {order.paymentMethod === "qr" ? "Transferencia por QR" : "Coordinación por WhatsApp"}
          {order.paymentMethod === "qr" && ` · ${({ awaiting_receipt: "sin comprobante", submitted: "comprobante pendiente de revisión",
            verified: "abono verificado", rejected: "comprobante rechazado", not_required: "sin pago" })[order.paymentStatus]}`}</p>
        {order.hasReceipt && <a className="mt-2 inline-block text-sm text-blue-800 underline"
          href={`/api/admin/orders/${order.id}/receipt`}>Descargar último comprobante</a>}
        {order.paymentStatus === "submitted" && <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-lg border border-green-700 px-3 py-2 text-sm text-green-800 disabled:opacity-50"
            disabled={busyId !== null} onClick={() => void review(order, "verify")} type="button">Verifiqué el abono en mi banca</button>
          <button className="rounded-lg border border-red-700 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
            disabled={busyId !== null} onClick={() => void review(order, "reject")} type="button">Rechazar comprobante</button>
        </div>}
        {order.paymentStatus === "submitted" && <p className="mt-2 text-xs text-amber-800">La imagen del comprobante no prueba el abono. Comprueba monto, cuenta y movimiento real en tu banca antes de verificar.</p>}
        {order.customerNote && <p className="mt-1 whitespace-pre-line text-sm"><span className="font-medium">Nota:</span> {order.customerNote}</p>}
        <ul className="mt-4 divide-y divide-zinc-100 border-y border-zinc-100 text-sm">
          {order.items.map((item, index) => <li className="flex flex-wrap justify-between gap-x-4 py-2" key={index}>
            <span>{item.quantity} × {item.productName} · {item.variantLabel}</span>
            <span>{money(item.lineTotalMinor)}</span>
          </li>)}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {order.status === "pending" && <button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busyId !== null || (order.paymentMethod === "qr" && order.paymentStatus !== "verified")}
            onClick={() => void confirm(order)} type="button">
            {busyId === order.id ? "Confirmando…" : "Confirmar y descontar inventario"}
          </button>}
          {order.confirmedAt && <span className="text-xs text-zinc-500">Confirmado el {new Date(order.confirmedAt).toLocaleString("es-BO")}</span>}
        </div>
      </article>)}
  </div>;
}
