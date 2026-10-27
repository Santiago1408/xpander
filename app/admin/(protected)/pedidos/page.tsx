import { Suspense } from "react";
import { PageHeader } from "../../admin-ui";
import OrdersEditor from "./orders-editor";

export default function Page() {
  return <>
    <PageHeader description="Revisa los pedidos registrados desde el carrito. Al confirmar uno se descuentan sus unidades del inventario de la sucursal de recojo." eyebrow="Operación · Pedidos" title="Pedidos" />
    <Suspense fallback={<p className="text-sm text-graphite">Cargando…</p>}><OrdersEditor /></Suspense>
  </>;
}
