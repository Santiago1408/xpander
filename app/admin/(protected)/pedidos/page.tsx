import { Suspense } from "react";
import Link from "next/link";
import { PageHeader, ui } from "../../admin-ui";
import OrdersEditor from "./orders-editor";

export default function Page() {
  return <>
    <PageHeader actions={<Link className={ui.secondary} href="/admin/vender">+ Venta en tienda</Link>}
      description="Revisa los pedidos registrados desde el carrito y las ventas hechas en tienda. Al confirmar un pedido se descuentan sus unidades del inventario de la sucursal de recojo." eyebrow="Operación · Pedidos" title="Pedidos" />
    <Suspense fallback={<p className="text-sm text-graphite">Cargando…</p>}><OrdersEditor /></Suspense>
  </>;
}
