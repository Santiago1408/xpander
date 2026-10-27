"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MediaImage from "../../media-image";
import { Card, ChipRow, EmptyState, Feedback, Pill, formatBOB, ui, type PillTone } from "../admin-ui";
import { useAdminUser } from "./admin-shell";

type OrderItem = { productName: string; variantLabel: string; unitPriceMinor: number; quantity: number; lineTotalMinor: number };
export type AdminOrder = {
  id: number; number: string; status: string; customerName: string; customerPhone: string; customerNote: string;
  pickupBranchName: string; pickupAddress: string; totalMinor: number; createdAt: string; confirmedAt: string | null;
  cancelledAt: string | null; deliveryMethod: "pickup" | "delivery"; channel: "online" | "store"; discountMinor: number;
  paymentMethod: "whatsapp" | "qr" | "cash" | "card" | "store_qr"; paymentStatus: "not_required" | "awaiting_receipt" | "submitted" | "verified" | "rejected";
  hasReceipt: boolean; items: OrderItem[];
};
type StockRow = { branchId: number; variantId: number; label: string; quantity: number };
type Product = { id: number; name: string; status: string; isDeleted: boolean; isFeatured: boolean; media: { url: string; altText: string }[] };

const day = 24 * 60 * 60 * 1000;
const periods = [7, 14, 30];

export const paymentMethodLabel: Record<AdminOrder["paymentMethod"], string> = {
  qr: "QR", whatsapp: "WhatsApp", cash: "Efectivo", card: "Tarjeta", store_qr: "QR en tienda",
};

export function deliveryLabel(order: AdminOrder) {
  return `${order.channel === "store" ? "En tienda" : order.deliveryMethod === "delivery" ? "Envío" : "Recojo"} · ${order.pickupBranchName}`;
}

// One shared vocabulary for order state across the dashboard and the orders screen.
export function orderState(order: AdminOrder): { label: string; tone: PillTone } {
  if (order.status === "confirmed" && order.channel === "store") return { label: "Venta en tienda", tone: "solid" };
  if (order.status === "confirmed") return { label: "Confirmado", tone: "solid" };
  if (order.status === "cancelled") return { label: "Cancelado", tone: "muted" };
  if (order.status !== "pending") return { label: order.status, tone: "outline" };
  if (order.paymentStatus === "submitted") return { label: "Comprobante por revisar", tone: "soft" };
  if (order.paymentStatus === "verified") return { label: "Pago verificado", tone: "outline" };
  if (order.paymentStatus === "rejected") return { label: "Comprobante rechazado", tone: "danger" };
  if (order.paymentStatus === "awaiting_receipt") return { label: "Esperando comprobante", tone: "dashed" };
  return { label: "Pendiente", tone: "dashed" };
}

function dayKey(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function niceMax(value: number) {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function compactBOB(minor: number) {
  const value = minor / 100;
  return value >= 1000 ? `${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 }).format(value / 1000)}k` : String(Math.round(value));
}

function SalesChart({ bars }: { bars: { label: string; value: number; orders: number }[] }) {
  const [hover, setHover] = useState(-1);
  const top = niceMax(Math.max(...bars.map((bar) => bar.value)));
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);
  const readout = hover >= 0 ? `${bars[hover].label} · ${formatBOB(bars[hover].value)} · ${bars[hover].orders} pedido(s)` : `Total ${formatBOB(total)}`;
  return <figure className="m-0 flex h-full flex-col gap-5">
    <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
      <span className="text-base font-semibold">Ventas confirmadas por día (Bs.)</span>
      <span aria-live="polite" className="font-mono text-[13px] text-body">{readout}</span>
    </figcaption>
    <div className="flex min-h-56 flex-1 gap-2.5">
      <div aria-hidden="true" className="flex w-11 flex-col justify-between pb-[22px] text-right font-mono text-[11px] text-graphite">
        <span>{compactBOB(top)}</span><span>{compactBOB(top / 2)}</span><span>0</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-1 items-end border-b border-ink bg-[linear-gradient(#ededed_1px,transparent_1px)] bg-[length:100%_50%]" onMouseLeave={() => setHover(-1)}>
          {bars.map((bar, index) => <button aria-label={`${bar.label}: ${formatBOB(bar.value)}, ${bar.orders} pedido(s)`}
            className="group flex h-full flex-1 cursor-crosshair items-end justify-center px-px outline-none" key={bar.label}
            onBlur={() => setHover(-1)} onFocus={() => setHover(index)} onMouseEnter={() => setHover(index)} type="button">
            <span className={`block w-full max-w-6 rounded-t-[4px] transition-colors group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ink ${
              hover === -1 || hover === index ? "bg-ink" : "bg-[#bdbdbd]"}`}
              style={{ height: bar.value > 0 ? `max(2px, ${(bar.value / top) * 100}%)` : 0 }} />
          </button>)}
        </div>
        <div aria-hidden="true" className="flex justify-between pt-2 font-mono text-[11px] text-graphite">
          <span>{bars[0]?.label}</span><span>{bars.at(-1)?.label}</span>
        </div>
      </div>
    </div>
    {/* Firefox does not clip a table caption with the table, so the wrapper is hidden instead. */}
    <div className="sr-only"><table>
      <caption>Ventas confirmadas por día</caption>
      <thead><tr><th scope="col">Día</th><th scope="col">Ventas</th><th scope="col">Pedidos</th></tr></thead>
      <tbody>{bars.map((bar) => <tr key={bar.label}><td>{bar.label}</td><td>{formatBOB(bar.value)}</td><td>{bar.orders}</td></tr>)}</tbody>
    </table></div>
  </figure>;
}

export default function Dashboard() {
  const displayName = useAdminUser()?.displayName || "";
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [now, setNow] = useState(0);
  const [period, setPeriod] = useState(14);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [ordersResponse, inventoryResponse, productsResponse] = await Promise.all([
          fetch("/api/admin/orders", { cache: "no-store" }),
          fetch("/api/admin/inventory", { cache: "no-store" }),
          fetch("/api/admin/catalog/products", { cache: "no-store" }),
        ]);
        if (!ordersResponse.ok || !inventoryResponse.ok || !productsResponse.ok) throw new Error("No se pudo cargar el resumen.");
        setOrders((await ordersResponse.json()) as AdminOrder[]);
        setStock(((await inventoryResponse.json()) as { stock: StockRow[] }).stock);
        setProducts((await productsResponse.json()) as Product[]);
        setNow(Date.now());
      } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo cargar el resumen."); }
    })();
  }, []);

  const stats = useMemo(() => {
    if (!orders || !now) return null;
    const start = now - period * day;
    const confirmed = orders.filter((order) => order.confirmedAt && new Date(order.confirmedAt).getTime() >= start);
    const created = orders.filter((order) => new Date(order.createdAt).getTime() >= start);
    const sales = confirmed.reduce((sum, order) => sum + order.totalMinor, 0);
    const buckets = new Map<string, { value: number; orders: number }>();
    for (const order of confirmed) {
      const key = dayKey(new Date(order.confirmedAt!).getTime());
      const bucket = buckets.get(key) || { value: 0, orders: 0 };
      buckets.set(key, { value: bucket.value + order.totalMinor, orders: bucket.orders + 1 });
    }
    const bars = Array.from({ length: period }, (_, index) => {
      const time = now - (period - 1 - index) * day;
      const date = new Date(time);
      return { label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
        ...(buckets.get(dayKey(time)) || { value: 0, orders: 0 }) };
    });
    const pending = orders.filter((order) => order.status === "pending");
    const byState = [
      { label: "Esperando comprobante QR", count: pending.filter((order) => order.paymentStatus === "awaiting_receipt" || order.paymentStatus === "rejected").length },
      { label: "Comprobantes por revisar", count: pending.filter((order) => order.paymentStatus === "submitted").length },
      { label: "Pago verificado, sin confirmar", count: pending.filter((order) => order.paymentStatus === "verified").length },
      { label: "Confirmados", count: orders.filter((order) => order.status === "confirmed").length },
      { label: "Cancelados", count: orders.filter((order) => order.status === "cancelled").length },
      // Orders created before QR-only checkout, if any remain open.
      { label: "Pendientes sin pago en línea", count: pending.filter((order) => order.paymentMethod === "whatsapp").length },
    ].filter((item, index) => index < 5 || item.count > 0);
    const sold = new Map<string, { units: number; revenue: number }>();
    for (const order of confirmed) for (const item of order.items) {
      const entry = sold.get(item.productName) || { units: 0, revenue: 0 };
      sold.set(item.productName, { units: entry.units + item.quantity, revenue: entry.revenue + item.lineTotalMinor });
    }
    const best = [...sold.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 4);
    const storeSales = confirmed.filter((order) => order.channel === "store").length;
    return { confirmed, created, sales, bars, pending, byState, best, storeSales };
  }, [orders, now, period]);

  const hour = now ? new Date(now).getHours() : 12;
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const lowStock = [...stock].filter((row) => row.quantity <= 3).sort((a, b) => a.quantity - b.quantity).slice(0, 6);
  const activeProducts = products.filter((product) => !product.isDeleted && product.status === "active").length;
  const recent = (orders || []).filter((order) => filter === "all" ||
    (filter === "pending" && order.status === "pending" && order.paymentStatus !== "submitted") ||
    (filter === "review" && order.status === "pending" && order.paymentStatus === "submitted") ||
    (filter === "confirmed" && order.status === "confirmed")).slice(0, 7);
  const maxState = Math.max(1, ...(stats?.byState.map((item) => item.count) || [1]));

  return <>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={ui.eyebrow}>Resumen · últimos {orders?.length ?? 0} pedidos registrados</span>
        <h1 className="xp-display m-0 text-[clamp(28px,3vw,40px)] leading-none">{now ? `${greeting}, ${displayName.split(" ")[0]}` : "Resumen"}</h1>
      </div>
      <div aria-label="Periodo" className="flex border border-ink bg-white" role="group">
        {periods.map((value) => <button aria-pressed={period === value} className={`h-11 px-4 font-mono text-[13px] ${period === value ? "bg-ink text-white" : "hover:bg-soft"}`}
          key={value} onClick={() => setPeriod(value)} type="button">{value} días</button>)}
      </div>
    </div>
    <Feedback error={error} />

    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {[
        { label: "Ventas confirmadas", value: stats ? formatBOB(stats.sales) : "—", note: `${stats?.confirmed.length ?? 0} venta(s) · ${stats?.storeSales ?? 0} en tienda` },
        { label: "Pedidos registrados", value: stats ? String(stats.created.length) : "—", note: `en los últimos ${period} días` },
        { label: "Ticket promedio", value: stats && stats.confirmed.length ? formatBOB(Math.round(stats.sales / stats.confirmed.length)) : "—", note: "por pedido confirmado" },
        { label: "Por atender", value: stats ? String(stats.pending.length) : "—", note: `${stats?.byState[1].count ?? 0} comprobante(s) por revisar` },
      ].map((kpi) => <div className="flex flex-col gap-3.5 bg-white p-4 sm:p-[22px]" key={kpi.label}>
        <span className="text-[13px] text-graphite">{kpi.label}</span>
        <span className="font-mono text-[clamp(22px,2.4vw,30px)] tracking-[-0.02em]">{kpi.value}</span>
        <span className="text-xs text-graphite">{kpi.note}</span>
      </div>)}
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div className="bg-white p-5 sm:p-6">{stats ? <SalesChart bars={stats.bars} /> : <p className="text-sm text-graphite">Cargando ventas…</p>}</div>
      <Card title="Pedidos por estado">
        <div className="flex flex-col gap-4">
          {stats?.byState.map((item) => <div className="flex flex-col gap-2" key={item.label}>
            <div className="flex justify-between gap-3 text-sm"><span>{item.label}</span><span className="font-mono">{item.count}</span></div>
            <div className="h-2.5 bg-mist"><div className="h-2.5 bg-ink" style={{ width: `${(item.count / maxState) * 100}%` }} /></div>
          </div>)}
        </div>
        <div className="mt-5 flex flex-col gap-2.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><span className="text-graphite">Productos activos</span><span className="font-mono">{activeProducts}</span></div>
          <div className="flex justify-between"><span className="text-graphite">Destacados</span><span className="font-mono">{products.filter((product) => !product.isDeleted && product.isFeatured).length}</span></div>
        </div>
      </Card>
    </div>

    <div className="grid items-start grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <section className="min-w-0 max-w-full overflow-hidden bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 className={ui.cardTitle}>Pedidos recientes</h2>
          <ChipRow className="w-full sm:w-auto" label="Filtrar por estado">
            {[["all", "Todos"], ["pending", "Pendientes"], ["review", "Por revisar"], ["confirmed", "Confirmados"]].map(([value, label]) =>
              <button aria-pressed={filter === value} className={`${ui.chip(filter === value)} shrink-0`} key={value} onClick={() => setFilter(value)} type="button">{label}</button>)}
          </ChipRow>
        </div>
        {!orders ? <p className="p-6 text-sm text-graphite">Cargando pedidos…</p> : recent.length === 0 ? <p className="p-6 text-sm text-graphite">No hay pedidos con este estado.</p> :
          <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-[640px] border-collapse text-sm">
            <thead><tr><th className={`${ui.th} sticky left-0 bg-white`}>Pedido</th><th className={ui.th}>Cliente</th><th className={ui.th}>Entrega</th>
              <th className={ui.th}>Pago</th><th className={ui.th}>Estado</th><th className={`${ui.th} text-right`}>Total</th></tr></thead>
            <tbody>{recent.map((order) => {
              const state = orderState(order);
              return <tr className="group hover:bg-soft" key={order.id}>
                <td className={`${ui.td} sticky left-0 whitespace-nowrap bg-white font-mono text-[13px] shadow-[1px_0_0_#ededed] group-hover:bg-soft`}><Link className="hover:underline" href={`/admin/pedidos?q=${order.number}`}>{order.number}</Link></td>
                <td className={ui.td}>{order.customerName}</td>
                <td className={`${ui.td} whitespace-nowrap text-graphite`}>{deliveryLabel(order)}</td>
                <td className={`${ui.td} whitespace-nowrap text-graphite`}>{paymentMethodLabel[order.paymentMethod]}</td>
                <td className={ui.td}><Pill tone={state.tone}>{state.label}</Pill></td>
                <td className={`${ui.td} whitespace-nowrap text-right font-mono`}>{formatBOB(order.totalMinor)}</td>
              </tr>;
            })}</tbody>
          </table></div>}
        <div className="flex justify-between border-t border-line px-5 py-4 text-sm sm:px-6">
          <span className="text-graphite">{recent.length} pedido(s)</span>
          <Link className="font-semibold underline underline-offset-4" href="/admin/pedidos">Ver todos los pedidos</Link>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <Card title="Más vendidos" description={`Pedidos confirmados en ${period} días`}>
          {!stats?.best.length ? <p className="m-0 text-sm text-graphite">Aún no hay ventas confirmadas en este periodo.</p> :
            <ul className="m-0 flex list-none flex-col gap-4 p-0">{stats.best.map(([name, value]) => {
              const image = products.find((product) => product.name === name)?.media[0];
              return <li className="flex items-center gap-3.5" key={name}>
                <span className="relative size-14 shrink-0 overflow-hidden bg-mist">
                  {image && <MediaImage alt="" className="absolute inset-0 h-full w-full object-cover" height={56} sizes="56px" src={image.url} width={56} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-sm font-medium">{name}</span>
                  <span className="text-xs text-graphite">{value.units} unidades</span></span>
                <span className="font-mono text-[13px]">{formatBOB(value.revenue)}</span>
              </li>;
            })}</ul>}
        </Card>
        <section className="bg-ink p-5 text-white sm:p-6">
          <div className="flex items-baseline justify-between"><h2 className={ui.cardTitle}>Stock bajo</h2>
            <span className="font-mono text-xs text-[#bdbdbd]">{lowStock.length} alerta(s) · ≤ 3 u.</span></div>
          {lowStock.length === 0 ? <p className="mb-0 mt-4 text-sm text-[#bdbdbd]">No hay variantes con 3 unidades o menos.</p> :
            <ul className="m-0 mt-3 list-none p-0">{lowStock.map((row) => <li className="flex justify-between gap-3 border-t border-[#333] py-3 text-sm" key={`${row.branchId}-${row.variantId}`}>
              <span className="min-w-0">{row.label}</span><span className="shrink-0 font-mono">{row.quantity} u.</span>
            </li>)}</ul>}
          <Link className="mt-3 inline-block text-sm font-semibold underline underline-offset-4" href="/admin/inventario">Gestionar inventario →</Link>
        </section>
      </div>
    </div>
    {orders && orders.length === 0 && <EmptyState>Cuando un cliente registre un pedido desde el carrito, aparecerá aquí.</EmptyState>}
  </>;
}
